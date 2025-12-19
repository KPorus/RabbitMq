import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import amqp from 'amqplib';
@Injectable()
export class Worker implements OnModuleDestroy {
  conn: amqp.Connection;
  ch: amqp.Channel;
  exchange = 'notifications.topic';
  private readonly url: string;

  constructor(private readonly configService: ConfigService) {
    this.url = this.configService.get<string>('AMQP_URL') as string;
  }
  onModuleDestroy() {
    this.conn.close();
    this.ch.close();
    throw new Error('Method not implemented.');
  }
  // async init() {
  //   this.conn = await amqp.connect(this.url);
  //   this.ch = await this.conn.createChannel();
  //   await this.ch.assertExchange(this.exchange, 'topic', { durable: true });
  //   console.log('Worker connected');
  // }

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

        this.ch = await this.conn.createChannel();
        await this.ch.assertExchange(this.exchange, 'topic', { durable: true });
        console.log('Worker connected');
        return;
      } catch (err) {
        retries--;
        console.error('❌ RabbitMQ not ready, retrying...', err.message);
        await new Promise((r) => setTimeout(r, 3000));
      }
    }

    console.error('❌ RabbitMQ connection failed after retries');
  }

  async assertQueue(
    name: string,
    opts: any,
  ): Promise<amqp.Replies.AssertQueue> {
    return await this.ch.assertQueue(name, opts);
  }
  async bindQueue(q: string, pattern: string): Promise<amqp.Replies.Empty> {
    return await this.ch.bindQueue(q, this.exchange, pattern);
  }
  async consume(
    q: string,
    cb: (msg: amqp.Message, ch: amqp.Channel) => Promise<void>,
    prefetch = 10,
  ): Promise<amqp.Replies.Consume> {
    await this.ch.prefetch(prefetch);

    return this.ch.consume(q, async (msg: amqp.Message) => {
      try {
        await cb(msg, this.ch);
      } catch (err) {
        console.error('consumer cb error', err);
      }
    });
  }
  async publishToQueue(
    exchange: string,
    routingKey: string,
    msg: unknown,
  ): Promise<boolean> {
    const ok: boolean = await this.ch.publish(
      exchange,
      routingKey,
      Buffer.from(JSON.stringify(msg)),
      { persistent: true },
    );
    console.log('publishToQueue: ', ok);

    return ok;
  }
}
