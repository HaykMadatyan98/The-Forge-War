import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { oauthEnv, verifyOauthIdToken, type OauthProvider } from './oauth';
import { allowDevEmailToken, returnVerifyTokenOnMailFail, sendVerificationEmail } from './mail';

const SESSION_DAYS = 14;
const VERIFY_HOURS = 48;
const RESET_HOURS = 2;
const PASSWORD_MIN = 8;

export type PublicPlayer = {
  id: string;
  email: string;
  displayName: string | null;
  avatarKey: string | null;
  emailVerified: boolean;
  role: string;
  createdAt: Date;
};

@Injectable()
export class AuthService {
  constructor(private readonly prisma: PrismaService) {}

  private hashToken(raw: string) {
    return createHash('sha256').update(raw).digest('hex');
  }

  private publicPlayer(p: {
    id: string;
    email: string;
    displayName: string | null;
    avatarKey?: string | null;
    emailVerified?: boolean;
    role?: string;
    createdAt: Date;
  }): PublicPlayer {
    return {
      id: p.id,
      email: p.email,
      displayName: p.displayName,
      avatarKey: p.avatarKey ?? null,
      emailVerified: !!p.emailVerified,
      role: p.role || 'user',
      createdAt: p.createdAt,
    };
  }

  isAdmin(p: { role?: string; email?: string }) {
    if (p.role === 'admin') return true;
    const list = (process.env.ADMIN_EMAILS || '')
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);
    return !!(p.email && list.includes(p.email.toLowerCase()));
  }

  private normalizeDisplayName(raw?: string) {
    const s = String(raw || '')
      .trim()
      .replace(/\s+/g, ' ')
      .slice(0, 24);
    return s.length >= 2 ? s : null;
  }

  private normalizeAvatarKey(raw?: string | null) {
    const s = String(raw || '').trim();
    if (/^p[0-4]$/.test(s)) return s;
    const leg = /^a([1-9]|1[0-2])$/.exec(s);
    if (leg) return `p${(Math.max(1, Number(leg[1])) - 1) % 5}`;
    if (
      /^data:image\/(jpeg|jpg|png|webp);base64,/i.test(s) &&
      s.length >= 32 &&
      s.length <= 120_000
    ) {
      return s;
    }
    return null;
  }

  private async issueSession(playerId: string) {
    const raw = randomBytes(32).toString('base64url');
    const tokenHash = this.hashToken(raw);
    const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
    await this.prisma.session.create({
      data: { playerId, tokenHash, expiresAt },
    });
    return { token: raw, expiresAt };
  }

  private normalizeEmail(email: string) {
    return String(email || '').trim().toLowerCase();
  }

  private async createEmailToken(playerId: string) {
    await this.prisma.emailVerifyToken.deleteMany({ where: { playerId } });
    const raw = randomBytes(32).toString('base64url');
    const tokenHash = this.hashToken(raw);
    const expiresAt = new Date(Date.now() + VERIFY_HOURS * 60 * 60 * 1000);
    await this.prisma.emailVerifyToken.create({
      data: { playerId, tokenHash, expiresAt },
    });
    return raw;
  }

  private async sendVerify(player: { id: string; email: string }) {
    const raw = await this.createEmailToken(player.id);
    const mail = await sendVerificationEmail(player.email, raw);
    return { raw, mail };
  }

  private attachVerifyTokenOut(
    out: Record<string, unknown>,
    raw: string,
    mail: { sent: boolean },
  ) {
    if (allowDevEmailToken()) out.devVerifyToken = raw;
    if (!mail.sent && returnVerifyTokenOnMailFail()) out.verifyToken = raw;
    if (!mail.sent) out.emailDeliveryFailed = true;
  }

  async register(body: {
    email?: string;
    password?: string;
    displayName?: string;
    avatarKey?: string;
  }) {
    const email = this.normalizeEmail(body.email || '');
    const password = String(body.password || '');
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new BadRequestException('invalid_email');
    }
    if (password.length < PASSWORD_MIN) throw new BadRequestException('password_min_8');

    const existing = await this.prisma.player.findUnique({ where: { email } });
    if (existing) {
      if (existing.emailVerified) throw new ConflictException('email_taken');
      // Allow re-register of unverified stub (prevents permanent email squat)
      await this.prisma.player.delete({ where: { id: existing.id } });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const player = await this.prisma.player.create({
      data: {
        email,
        passwordHash,
        emailVerified: false,
        displayName: this.normalizeDisplayName(body.displayName) || email.split('@')[0],
        avatarKey: this.normalizeAvatarKey(body.avatarKey) || 'p0',
      },
    });

    const { raw: rawToken, mail } = await this.sendVerify(player);

    const out: Record<string, unknown> = {
      ok: true,
      needsVerification: true,
      email: player.email,
      message: mail.sent ? 'check_email' : 'check_email_or_contact_support',
    };
    this.attachVerifyTokenOut(out, rawToken, mail);
    return out;
  }

  async login(body: { email?: string; password?: string }) {
    const email = this.normalizeEmail(body.email || '');
    const password = String(body.password || '');
    const player = await this.prisma.player.findUnique({ where: { email } });
    if (!player?.passwordHash) throw new UnauthorizedException('bad_credentials');
    const ok = await bcrypt.compare(password, player.passwordHash);
    if (!ok) throw new UnauthorizedException('bad_credentials');

    if (!player.emailVerified) {
      throw new ForbiddenException('email_not_verified');
    }

    const session = await this.issueSession(player.id);
    return {
      token: session.token,
      expiresAt: session.expiresAt.toISOString(),
      player: this.publicPlayer(player),
    };
  }

  async verifyEmail(body: { token?: string }) {
    const raw = String(body.token || '').trim();
    if (!raw) throw new BadRequestException('missing_token');
    const tokenHash = this.hashToken(raw);
    const row = await this.prisma.emailVerifyToken.findUnique({
      where: { tokenHash },
      include: { player: true },
    });
    if (!row) throw new BadRequestException('invalid_token');
    if (row.expiresAt.getTime() < Date.now()) {
      await this.prisma.emailVerifyToken.delete({ where: { id: row.id } }).catch(() => {});
      throw new BadRequestException('token_expired');
    }

    const player = await this.prisma.player.update({
      where: { id: row.playerId },
      data: { emailVerified: true },
    });
    await this.prisma.emailVerifyToken.deleteMany({ where: { playerId: player.id } });

    const session = await this.issueSession(player.id);
    return {
      token: session.token,
      expiresAt: session.expiresAt.toISOString(),
      player: this.publicPlayer(player),
    };
  }

  async resendVerification(body: { email?: string }) {
    const email = this.normalizeEmail(body.email || '');
    if (!email) throw new BadRequestException('invalid_email');
    const player = await this.prisma.player.findUnique({ where: { email } });
    // Always ok-looking response for enumeration resistance
    if (!player || player.emailVerified || !player.passwordHash) {
      return { ok: true, message: 'if_registered_check_email' };
    }
    const { raw, mail } = await this.sendVerify(player);
    const out: Record<string, unknown> = { ok: true, message: 'if_registered_check_email' };
    this.attachVerifyTokenOut(out, raw, mail);
    return out;
  }

  private async createPasswordResetToken(playerId: string) {
    await this.prisma.passwordResetToken.deleteMany({ where: { playerId } });
    const raw = randomBytes(32).toString('base64url');
    const tokenHash = this.hashToken(raw);
    const expiresAt = new Date(Date.now() + RESET_HOURS * 60 * 60 * 1000);
    await this.prisma.passwordResetToken.create({
      data: { playerId, tokenHash, expiresAt },
    });
    return raw;
  }

  async requestPasswordReset(body: { email?: string }) {
    const email = this.normalizeEmail(body.email || '');
    if (!email) throw new BadRequestException('invalid_email');
    const player = await this.prisma.player.findUnique({ where: { email } });
    if (player?.passwordHash && player.emailVerified) {
      const raw = await this.createPasswordResetToken(player.id);
      const { sendPasswordResetEmail } = await import('./mail');
      const mail = await sendPasswordResetEmail(player.email, raw);
      const out: Record<string, unknown> = { ok: true, message: 'if_registered_check_email' };
      if (allowDevEmailToken()) out.devResetToken = raw;
      if (!mail.sent && returnVerifyTokenOnMailFail()) out.resetToken = raw;
      if (!mail.sent) out.emailDeliveryFailed = true;
      return out;
    }
    return { ok: true, message: 'if_registered_check_email' };
  }

  async resetPassword(body: { token?: string; password?: string }) {
    const raw = String(body.token || '').trim();
    const password = String(body.password || '');
    if (!raw) throw new BadRequestException('missing_token');
    if (password.length < PASSWORD_MIN) throw new BadRequestException('password_min_8');

    const tokenHash = this.hashToken(raw);
    const row = await this.prisma.passwordResetToken.findUnique({
      where: { tokenHash },
      include: { player: true },
    });
    if (!row) throw new BadRequestException('invalid_token');
    if (row.expiresAt.getTime() < Date.now()) {
      await this.prisma.passwordResetToken.delete({ where: { id: row.id } }).catch(() => {});
      throw new BadRequestException('token_expired');
    }

    const passwordHash = await bcrypt.hash(password, 12);
    await this.prisma.player.update({
      where: { id: row.playerId },
      data: { passwordHash },
    });
    await this.prisma.passwordResetToken.deleteMany({ where: { playerId: row.playerId } });
    await this.prisma.session.deleteMany({ where: { playerId: row.playerId } });

    return { ok: true };
  }

  oauthConfig() {
    const env = oauthEnv();
    return {
      google: env.google,
      apple: env.apple,
      googleClientId: env.google ? env.googleClientId : null,
      appleClientId: env.apple ? env.appleClientId : null,
      appleRedirectUri: env.apple ? env.appleRedirectUri : null,
    };
  }

  /**
   * OAuth: link by provider subject only, then by verified email only.
   * Never attaches to unverified password stubs (deletes squats when OAuth email matches).
   */
  async oauthLogin(body: { provider?: string; idToken?: string; displayName?: string }) {
    const provider = String(body.provider || '').toLowerCase() as OauthProvider;
    if (provider !== 'google' && provider !== 'apple') {
      throw new BadRequestException('invalid_provider');
    }

    const identity = await verifyOauthIdToken(provider, String(body.idToken || ''));
    if (!identity.emailVerified && !identity.email.endsWith('@priv.local')) {
      throw new UnauthorizedException('oauth_email_unverified');
    }

    let player =
      provider === 'google'
        ? await this.prisma.player.findUnique({ where: { googleSub: identity.subject } })
        : await this.prisma.player.findUnique({ where: { appleSub: identity.subject } });

    if (!player && identity.email && !identity.email.endsWith('@priv.local')) {
      const byEmail = await this.prisma.player.findUnique({ where: { email: identity.email } });
      if (byEmail) {
        if (byEmail.emailVerified) {
          player = byEmail;
        } else {
          // Remove unverified email-password squat so OAuth owner can claim
          await this.prisma.player.delete({ where: { id: byEmail.id } });
        }
      }
    }

    if (player) {
      const patch: {
        googleSub?: string;
        appleSub?: string;
        displayName?: string;
        email?: string;
        emailVerified?: boolean;
      } = {};
      if (provider === 'google' && !player.googleSub) patch.googleSub = identity.subject;
      if (provider === 'apple' && !player.appleSub) patch.appleSub = identity.subject;
      const dn = identity.displayName || body.displayName?.trim();
      if (dn && !player.displayName) patch.displayName = dn;
      if (!player.emailVerified && identity.emailVerified) patch.emailVerified = true;
      if (
        identity.email &&
        !identity.email.endsWith('@priv.local') &&
        player.email.endsWith('@priv.local')
      ) {
        const clash = await this.prisma.player.findUnique({ where: { email: identity.email } });
        if (!clash) patch.email = identity.email;
      }
      if (Object.keys(patch).length) {
        player = await this.prisma.player.update({ where: { id: player.id }, data: patch });
      }
    } else {
      const displayName =
        identity.displayName ||
        body.displayName?.trim() ||
        identity.email.split('@')[0] ||
        (provider === 'apple' ? 'Apple player' : 'Player');
      player = await this.prisma.player.create({
        data: {
          email: identity.email,
          passwordHash: null,
          emailVerified: true,
          displayName,
          avatarKey: 'p0',
          googleSub: provider === 'google' ? identity.subject : undefined,
          appleSub: provider === 'apple' ? identity.subject : undefined,
        },
      });
    }

    const session = await this.issueSession(player.id);
    return {
      token: session.token,
      expiresAt: session.expiresAt.toISOString(),
      player: this.publicPlayer(player),
    };
  }

  async updateProfile(
    rawToken: string | null,
    body: { displayName?: string; avatarKey?: string },
  ) {
    const player = await this.playerFromToken(rawToken);
    if (!player) throw new UnauthorizedException('unauthorized');

    const data: { displayName?: string; avatarKey?: string } = {};
    if (body.displayName !== undefined) {
      const dn = this.normalizeDisplayName(body.displayName);
      if (!dn) throw new BadRequestException('invalid_display_name');
      data.displayName = dn;
    }
    if (body.avatarKey !== undefined) {
      const av = this.normalizeAvatarKey(body.avatarKey);
      if (!av) throw new BadRequestException('invalid_avatar');
      data.avatarKey = av;
    }
    if (!Object.keys(data).length) throw new BadRequestException('empty_profile');

    const updated = await this.prisma.player.update({
      where: { id: player.id },
      data,
    });

    await this.prisma.pvpDefense
      .updateMany({
        where: { playerId: player.id },
        data: {
          ...(data.displayName ? { displayName: data.displayName } : {}),
          ...(data.avatarKey ? { avatarKey: data.avatarKey } : {}),
        },
      })
      .catch(() => {});

    return { player: this.publicPlayer(updated) };
  }

  async logout(rawToken: string | null) {
    if (!rawToken) return { ok: true };
    const tokenHash = this.hashToken(rawToken);
    await this.prisma.session.deleteMany({ where: { tokenHash } });
    return { ok: true };
  }

  async me(rawToken: string | null) {
    const player = await this.playerFromToken(rawToken);
    if (!player) throw new UnauthorizedException('unauthorized');
    return { player: this.publicPlayer(player) };
  }

  async playerFromToken(rawToken: string | null) {
    if (!rawToken) return null;
    const tokenHash = this.hashToken(rawToken);
    const session = await this.prisma.session.findUnique({
      where: { tokenHash },
      include: { player: true },
    });
    if (!session) return null;
    if (session.expiresAt.getTime() < Date.now()) {
      await this.prisma.session.delete({ where: { id: session.id } }).catch(() => {});
      return null;
    }
    if (!session.player.emailVerified) {
      // Sessions only issued after verify / OAuth, but belt-and-suspenders
      await this.prisma.session.delete({ where: { id: session.id } }).catch(() => {});
      return null;
    }
    return session.player;
  }
}
