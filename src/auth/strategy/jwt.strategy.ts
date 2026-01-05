import { Injectable } from "@nestjs/common"
import { ConfigService } from "@nestjs/config"
import { PassportStrategy } from "@nestjs/passport"
import { ExtractJwt, Strategy } from "passport-jwt"
import type { Request } from "express"

function cookieExtractor(req: Request): string | null {
  const token = (req as any)?.cookies?.accessToken
  return token || null
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, "jwt") {
  constructor(configService: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        cookieExtractor, 
        ExtractJwt.fromAuthHeaderAsBearerToken(), 
      ]),
      secretOrKey: configService.get<string>("JWT_SECRET") as string,
    })
  }

  async validate(payload: any) {
    return {
      sub: payload.sub,
      id: payload.sub,
      email: payload.email,
      isAdmin: payload.isAdmin,
      role: payload.role,
    }
  }
}
