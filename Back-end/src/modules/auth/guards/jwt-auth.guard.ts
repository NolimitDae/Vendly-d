import {
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { CSRF_MESSAGE, csrfBlocked } from '../auth-cookies';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  canActivate(context: ExecutionContext) {
    // A change made with only the website's session cookie must come from the website itself.
    if (context.getType() === 'http' && csrfBlocked(context.switchToHttp().getRequest())) {
      throw new ForbiddenException(CSRF_MESSAGE);
    }
    return super.canActivate(context);
  }

  handleRequest(err, user, info) {
    // You can throw an exception based on either "info" or "err" arguments
    if (err || !user) {
      throw err || new UnauthorizedException();
    }
    return user;
  }
}
