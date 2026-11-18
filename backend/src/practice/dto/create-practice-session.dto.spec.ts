import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreatePracticeSessionDto } from './create-practice-session.dto';

// Cùng cơ chế với ValidationPipe({ transform: true }) trong main.ts → lỗi validate = HTTP 400
const check = (over: Record<string, unknown>) =>
  validate(
    plainToInstance(CreatePracticeSessionDto, {
      clientRequestId: 'b1f1c7d2-0000-4000-8000-000000000001',
      songId: null,
      durationSec: 1800,
      practicedAt: '2026-11-04T09:30:00Z',
      ...over,
    }),
    { whitelist: true, forbidNonWhitelisted: true },
  );

describe('CreatePracticeSessionDto', () => {
  it('hợp lệ (songId null)', async () => {
    expect(await check({})).toHaveLength(0);
  });

  it.each([
    ['âm', -5],
    ['bằng 0', 0],
    ['< 10 giây', 9],
    ['quá 4 giờ', 14401],
    ['không phải số nguyên', 12.5],
    ['là chuỗi', '1800'],
  ])('durationSec %s → lỗi validate', async (_label, durationSec) => {
    const errors = await check({ durationSec });
    expect(errors.map((e) => e.property)).toContain('durationSec');
  });

  it.each([10, 14400])('durationSec biên %i được chấp nhận', async (durationSec) => {
    expect(await check({ durationSec })).toHaveLength(0);
  });

  it('clientRequestId không phải UUID → lỗi', async () => {
    expect((await check({ clientRequestId: 'abc' })).map((e) => e.property)).toContain('clientRequestId');
  });

  it('practicedAt thiếu múi giờ → lỗi', async () => {
    expect((await check({ practicedAt: '2026-11-04T09:30:00' })).map((e) => e.property)).toContain('practicedAt');
  });

  it('clientRequestId viết hoa được chuẩn hóa về chữ thường', () => {
    const dto = plainToInstance(CreatePracticeSessionDto, { clientRequestId: 'B1F1C7D2-0000-4000-8000-000000000001' });
    expect(dto.clientRequestId).toBe('b1f1c7d2-0000-4000-8000-000000000001');
  });
});
