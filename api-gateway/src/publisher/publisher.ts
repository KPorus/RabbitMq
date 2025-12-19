import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import amqp from 'amqplib';

@Injectable()
export class Publisher {
  conn: amqp.Connection;
  ch: amqp.Channel;
  exchange: string;
  url: string;
  confirmsEnabled = false;
  // constructor(
  //   private readonly amqpUrl: string = 'amqp://guest:guest@rabbitmq:5672',
  //   private readonly exchangeName: string = 'notifications.topic',
  //   configService: ConfigService,
  // ) {
  //   // this.url = this.amqpUrl;
  //   this.url = configService.get<string>('AMQP_URL') || this.amqpUrl;
  //   console.log(configService.get<string>('AMQP_URL'));
  //   this.exchange = this.exchangeName;
  //   this.init().catch((err) => {
  //     console.error('Failed to initialize publisher', err);
  //   });
  // }

  constructor(private readonly configService: ConfigService) {
    // console.log(this.configService.get<string>('AMQP_URL'));
    this.url = this.configService.get<string>('AMQP_URL') as string;
    this.exchange = 'notifications.topic';

    this.init().catch((err) => {
      console.error('Failed to initialize publisher', err);
    });
  }

  private buffer: Array<{ key: string; msg: any }> = [];
  private MAX_BUFFER = 1000;
  private async flushBuffer() {
    if (!this.ch) return;

    console.log(`🔁 Flushing ${this.buffer.length} buffered events`);

    const items = [...this.buffer];
    this.buffer = [];

    for (const e of items) {
      try {
        await this.publishDirect(e.key, e.msg);
      } catch {
        this.buffer.push(e);
        break;
      }
    }
  }

  async init(retries = 5) {
    while (retries > 0) {
      try {
        this.conn = await amqp.connect(this.url);

        this.conn.on('close', () => {
          console.error('❌ RabbitMQ connection closed. Reconnecting...');
          this.ch = undefined as any;
          this.init();
        });

        this.conn.on('error', (err) => {
          console.error('❌ RabbitMQ connection error', err);
        });

        this.ch = await this.conn.createConfirmChannel();
        await this.ch.assertExchange(this.exchange, 'topic', { durable: true });
        await this.flushBuffer();

        this.confirmsEnabled = true;
        console.log('✅ Publisher connected to', this.url);
        return;
      } catch (err) {
        retries--;
        console.error('❌ RabbitMQ not ready, retrying...', err.message);
        await new Promise((r) => setTimeout(r, 3000));
      }
    }

    console.error('❌ RabbitMQ connection failed after retries');
  }

  private async publishDirect(routingKey: string, message: any) {
    const payload = Buffer.from(JSON.stringify(message));

    await new Promise<void>((resolve, reject) => {
      this.ch.publish(
        this.exchange,
        routingKey,
        payload,
        { persistent: true },
        (err) => (err ? reject(new Error(err.message)) : resolve()),
      );
    });
  }

  async publish(routingKey: string, message: any) {
    if (!this.ch) {
      if (this.buffer.length >= this.MAX_BUFFER) {
        console.error('❌ Event buffer overflow. Dropping event.', routingKey);
        return;
      }
      this.buffer.push({ key: routingKey, msg: message });
      return;
    }

    try {
      await this.publishDirect(routingKey, message);
    } catch (err) {
      console.error('❌ Publish failed, re-buffering', err);
      this.buffer.push({ key: routingKey, msg: message });
    }
  }

  async close() {
    await this.ch?.close();
    await this.conn?.close();
  }
}
