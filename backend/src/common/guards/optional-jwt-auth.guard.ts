import { ExecutionContext, Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class OptionalJwtAuthGuard extends AuthGuard('jwt') {
  canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest();
    const authorization = request.headers.authorization;
    if (!authorization) return true;
    return super.canActivate(context);
  }

  handleRequest<TUser>(err: unknown, user: TUser) {
    if (err) throw err;
    return user;
  }
}
