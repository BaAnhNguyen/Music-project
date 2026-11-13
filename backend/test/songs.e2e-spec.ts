import { ExecutionContext, INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { PrismaService } from '../prisma/prisma.service';
import { AppModule } from '../src/app.module';
import { JwtAuthGuard } from '../src/common/guards/jwt-auth.guard';
import { OptionalJwtAuthGuard } from '../src/common/guards/optional-jwt-auth.guard';

// Cần Postgres + Redis đang chạy, đã migrate + seed (role 'user' phải tồn tại)
describe('Songs fork / optimistic locking (e2e, DB thật)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let userId: string;
  let songId: string;

  beforeAll(async () => {
    // Bỏ qua JWT thật: gắn thẳng user giả vào request
    const fakeAuth = {
      canActivate: (ctx: ExecutionContext) => {
        ctx.switchToHttp().getRequest().user = { userId, role: 'user' };
        return true;
      },
    };
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideGuard(JwtAuthGuard).useValue(fakeAuth)
      .overrideGuard(OptionalJwtAuthGuard).useValue(fakeAuth)
      .compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    await app.init();
    prisma = app.get(PrismaService);

    await prisma.role.upsert({ where: { code: 'user' }, update: {}, create: { code: 'user', name: 'User' } });
    const user = await prisma.user.create({
      data: { email: `e2e-${Date.now()}@test.local`, passwordHash: 'x', displayName: 'E2E', role: 'user' },
    });
    userId = user.userId;

    const song = await prisma.song.create({
      data: { ownerId: userId, title: 'Race', rawText: '{title: Race}\n[C]Hello', content: {}, version: 1 },
    });
    songId = song.songId;
    await prisma.songRevision.create({
      data: { songId, version: 1, rawText: song.rawText, content: {}, createdById: userId },
    });
  });

  afterAll(async () => {
    // Xóa bài (revision tự xóa theo cascade) rồi mới xóa user
    await prisma.song.deleteMany({ where: { ownerId: userId } });
    await prisma.user.delete({ where: { userId } });
    await app.close();
  });

  it('hai PATCH song song cùng version = 1: đúng 1 request 200, 1 request 409', async () => {
    const send = (rawText: string) =>
      request(app.getHttpServer()).patch(`/songs/${songId}`).send({ rawText, version: 1 });

    const [a, b] = await Promise.all([send('{title: Race}\n[C]A'), send('{title: Race}\n[C]B')]);

    expect([a.status, b.status].sort()).toEqual([200, 409]);
    const song = await prisma.song.findUniqueOrThrow({ where: { songId } });
    expect(song.version).toBe(2);
    const revisions = await prisma.songRevision.findMany({ where: { songId }, orderBy: { version: 'asc' } });
    expect(revisions.map((r) => r.version)).toEqual([1, 2]);
  });

  it('fork: tạo bản sao PRIVATE version 1, lineage trả về 2 cấp', async () => {
    const res = await request(app.getHttpServer()).post(`/songs/${songId}/fork`).expect(201);
    expect(res.body).toMatchObject({ forkedFromId: songId, version: 1, visibility: 'private' });

    const lineage = await request(app.getHttpServer()).get(`/songs/${res.body.songId}/lineage`).expect(200);
    expect(lineage.body.map((n: any) => n.songId)).toEqual([res.body.songId, songId]);
  });
});
