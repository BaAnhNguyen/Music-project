import { ArgumentsHost, Catch, ExceptionFilter } from '@nestjs/common';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  catch(_exception: unknown, _host: ArgumentsHost) {
    // TODO: chuẩn hóa response lỗi, map Prisma error (P2002 -> 409, P2025 -> 404)
  }
}
