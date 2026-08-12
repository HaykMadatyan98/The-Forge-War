import {
  Body,
  Controller,
  Get,
  Patch,
  Post,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { AuthService } from './auth.service';
import {
  attachAuthSession,
  clearSessionCookie,
  extractSessionToken,
  returnAuthTokenInBody,
} from './session-cookie';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  private sessionResponse(
    res: Response,
    data: { token: string; expiresAt: string; player: unknown },
  ) {
    attachAuthSession(res, data.token, new Date(data.expiresAt));
    if (returnAuthTokenInBody()) {
      return data;
    }
    return {
      expiresAt: data.expiresAt,
      player: data.player,
      cookieAuth: true as const,
    };
  }

  @Post('register')
  register(
    @Body()
    body: {
      email?: string;
      password?: string;
      displayName?: string;
      avatarKey?: string;
    },
  ) {
    return this.auth.register(body);
  }

  @Post('login')
  async login(
    @Body() body: { email?: string; password?: string },
    @Res({ passthrough: true }) res: Response,
  ) {
    const data = await this.auth.login(body);
    return this.sessionResponse(res, data);
  }

  @Post('verify-email')
  async verifyEmail(
    @Body() body: { token?: string },
    @Res({ passthrough: true }) res: Response,
  ) {
    const data = await this.auth.verifyEmail(body);
    return this.sessionResponse(res, data);
  }

  @Post('resend-verification')
  resendVerification(@Body() body: { email?: string }) {
    return this.auth.resendVerification(body);
  }

  @Post('forgot-password')
  forgotPassword(@Body() body: { email?: string }) {
    return this.auth.requestPasswordReset(body);
  }

  @Post('reset-password')
  resetPassword(@Body() body: { token?: string; password?: string }) {
    return this.auth.resetPassword(body);
  }

  @Get('oauth-config')
  oauthConfig() {
    return this.auth.oauthConfig();
  }

  @Post('oauth')
  async oauth(
    @Body()
    body: {
      provider?: string;
      idToken?: string;
      displayName?: string;
    },
    @Res({ passthrough: true }) res: Response,
  ) {
    const data = await this.auth.oauthLogin(body);
    return this.sessionResponse(res, data);
  }

  @Post('logout')
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    await this.auth.logout(extractSessionToken(req));
    clearSessionCookie(res);
    return { ok: true };
  }

  @Get('me')
  me(@Req() req: Request) {
    return this.auth.me(extractSessionToken(req));
  }

  @Patch('profile')
  profile(
    @Req() req: Request,
    @Body() body?: { displayName?: string; avatarKey?: string },
  ) {
    return this.auth.updateProfile(extractSessionToken(req), body || {});
  }
}

export { UnauthorizedException };
/** @deprecated use extractSessionToken(req) */
export function bearer(auth?: string) {
  if (!auth) return null;
  const m = /^Bearer\s+(.+)$/i.exec(auth);
  return m ? m[1].trim() : null;
}
