import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createInitialState } from '@tfw/game';
import { AppModule } from '../app.module';

const hasDb = !!process.env.DATABASE_URL;

describe.skipIf(!hasDb)('critical API flow (auth → save → pvp)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    process.env.RETURN_VERIFY_TOKEN_ON_MAIL_FAIL = '1';
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('v1');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
        transformOptions: { enableImplicitConversion: true },
      }),
    );
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
  });

  async function registerVerify(email: string, password: string) {
    const reg = await request(app.getHttpServer())
      .post('/v1/auth/register')
      .send({ email, password, displayName: 'E2E' });
    expect(reg.status).toBeLessThan(300);
    const verifyToken = reg.body.verifyToken || reg.body.devVerifyToken;
    expect(verifyToken).toBeTruthy();
    const verify = await request(app.getHttpServer())
      .post('/v1/auth/verify-email')
      .send({ token: verifyToken });
    expect(verify.status).toBeLessThan(300);
    expect(verify.body.token).toBeTruthy();
    return verify.body.token as string;
  }

  it('registers, saves, posts defense, challenges and records defeat', async () => {
    const ts = Date.now();
    const pass = 'TestPass123!';
    const tokenA = await registerVerify(`e2e_a_${ts}@test.local`, pass);
    const tokenB = await registerVerify(`e2e_b_${ts}@test.local`, pass);

    const saveA = createInitialState('en') as Record<string, unknown>;
    const putSave = await request(app.getHttpServer())
      .put('/v1/player/save')
      .set('Authorization', `Bearer ${tokenA}`)
      .send(saveA);
    expect(putSave.status).toBeLessThan(300);

    const defense = await request(app.getHttpServer())
      .put('/v1/pvp/defense')
      .set('Authorization', `Bearer ${tokenA}`);
    expect(defense.status).toBeLessThan(300);
    expect(defense.body.power).toBeGreaterThan(0);

    const saveB = createInitialState('en') as { warriors: { id: string }[] };
    await request(app.getHttpServer())
      .put('/v1/player/save')
      .set('Authorization', `Bearer ${tokenB}`)
      .send(saveB);

    const playerA = await request(app.getHttpServer())
      .get('/v1/auth/me')
      .set('Authorization', `Bearer ${tokenA}`);
    const playerIdA = playerA.body.player.id as string;

    const ch = await request(app.getHttpServer())
      .post('/v1/pvp/challenge')
      .set('Authorization', `Bearer ${tokenB}`)
      .send({ opponentId: playerIdA });
    expect(ch.status).toBeLessThan(300);
    expect(ch.body.matchId).toBeTruthy();

    const ids = saveB.warriors.slice(0, 2).map((w) => w.id);
    const positions = ids.map((_, i) => ({ x: 1, y: 1 + i }));

    const defeat = await request(app.getHttpServer())
      .post('/v1/pvp/result')
      .set('Authorization', `Bearer ${tokenB}`)
      .send({
        matchId: ch.body.matchId,
        victory: false,
        deployWarriorIds: ids,
        deployPositions: positions,
      });
    expect(defeat.status).toBeLessThan(300);
    expect(defeat.body.ok).toBe(true);
    expect(defeat.body.victory).toBe(false);
  });
});
