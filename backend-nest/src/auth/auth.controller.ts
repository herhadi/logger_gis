import { Body, Controller, Get, HttpCode, Post, Req, Res } from '@nestjs/common';
import { Request, Response } from 'express';
import { AuthService } from './auth.service';

@Controller('api')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  @HttpCode(200)
  login(@Body() body: { username: string; password: string }, @Req() req: Request) {
    return this.authService.login(body.username, body.password, req.session);
  }

  @Post('logout')
  async logout(@Req() req: Request, @Res() res: Response) {
    try {
      await this.authService.logout(req.session);
      res.clearCookie('connect.sid', { path: '/' });
      return res.json({ message: 'Berhasil logout' });
    } catch {
      return res.status(500).json({ error: 'Gagal logout' });
    }
  }

  @Get('session')
  session(@Req() req: Request) {
    return this.authService.sessionUser(req.session);
  }
}
