import nodemailer from 'nodemailer';
import Handlebars from 'handlebars';
import fs from 'fs';
import path from 'path';
import { ConfigService } from '@nestjs/config';
import { Injectable } from '@nestjs/common';

@Injectable()
export class EmailService {
  private transporter: nodemailer.Transporter;

  constructor(private readonly configService: ConfigService) {
    this.transporter = nodemailer.createTransport({
      // host: process.env.SMTP_HOST || 'smtp.ethereal.email',
      // port: Number(process.env.SMTP_PORT || 587),
      service: 'gmail',
      auth: {
        user: this.configService.get<string>('SMTP_USER') || '',
        pass: this.configService.get<string>('SMTP_PASS') || '',
      },
    });
  }

  async renderTemplate(name: string, data: unknown): Promise<string> {
    try {
      const file = path.join(__dirname, '..', '..', 'templates', `${name}.hbs`);
      const src = fs.readFileSync(file, 'utf8');
      const tpl = Handlebars.compile(src);
      return tpl(data);
    } catch (error) {
      // log and fall back to JSON string
      console.error('renderTemplate error', { name, error });
      return JSON.stringify(data ?? {});
    }
  }

  async send(
    to: string,
    subject: string,
    opts: { data?: unknown; template?: string },
  ): Promise<nodemailer.SentMessageInfo> {
    try {
      const html = opts.template
        ? await this.renderTemplate(opts.template, opts.data)
        : `<pre>${JSON.stringify(opts.data ?? {})}</pre>`;

      const info = await this.transporter.sendMail({
        from: this.configService.get<string>('EMAIL_FROM') as string,
        to,
        subject,
        html,
      });

      console.log('sent email', info && (info as any).messageId);
      return info;
    } catch (error) {
      // centralized error logging; rethrow so caller (worker) can decide DLQ/retry
      console.error('EmailService.send error', { to, subject, error });
      throw error;
    }
  }
}
