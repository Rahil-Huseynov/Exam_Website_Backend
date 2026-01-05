import { CacheInterceptor } from "@nestjs/cache-manager";
import { ExecutionContext } from "@nestjs/common";
import { HttpAdapterHost, Reflector } from "@nestjs/core";

export class CustomCacheInterceptor extends CacheInterceptor {
  constructor(
    cacheManager: Cache,
    reflector: Reflector,
    protected readonly httpAdapterHost: HttpAdapterHost,
  ) {
    super(cacheManager, reflector);
  }

  trackBy(context: ExecutionContext): string | undefined {
    const httpAdapter = this.httpAdapterHost.httpAdapter;
    if (!httpAdapter) {
      return undefined;
    }
    return super.trackBy(context);
  }
}
