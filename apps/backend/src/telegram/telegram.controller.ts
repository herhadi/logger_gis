import { Controller, Get, Headers, Post, Req, Res, UseGuards } from '@nestjs/common';
import { Request, Response } from 'express';
import { TelegramService } from './telegram.service';
import { SessionAuthGuard } from '../auth/session-auth.guard';

class AdminGuard extends SessionAuthGuard {
  canActivate(context: any) {
    const request = context.switchToHttp().getRequest() as Request & { session?: { user?: { role?: string } } };
    if (!request.session?.user || request.session.user.role !== 'admin') return false;
    return true;
  }
}

@Controller()
export class TelegramController {
  constructor(private readonly telegram: TelegramService) {}

  @Post('webhook') webhook(@Req() req: Request, @Res() res: Response) {
    return this.telegram.webhook(req.body).then(() => res.sendStatus(200));
  }

  @Get('api/test-telegram') @UseGuards(AdminGuard) testTelegram() { return this.telegram.testTelegram(); }
  @Get('api/test-monitor') @UseGuards(AdminGuard) testMonitor() { return this.telegram.checkLoggerAndNotify(); }
  @Get('api/set-webhook') @UseGuards(AdminGuard) setWebhook() { return this.telegram.setWebhook(); }
  @Get('api/webhook-info') @UseGuards(AdminGuard) webhookInfo() { return this.telegram.telegramRequest('getWebhookInfo'); }
  @Get('api/delete-webhook') @UseGuards(AdminGuard) deleteWebhook() { return this.telegram.telegramRequest('deleteWebhook'); }

  @Get('api/cron') cron(@Headers('x-cron-secret') secret: string) {
    return this.telegram.runCron(secret).then(() => 'OK');
  }
}
