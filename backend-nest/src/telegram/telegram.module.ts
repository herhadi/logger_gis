import { Module } from '@nestjs/common';
import { TelegramController } from './telegram.controller';
import { TelegramService } from './telegram.service';
import { SessionAuthGuard } from '../auth/session-auth.guard';

@Module({ controllers: [TelegramController], providers: [TelegramService, SessionAuthGuard] })
export class TelegramModule {}
