import { Injectable } from '@nestjs/common';
import { NotifyDto, OrderDto, UserDto } from './Dto/dto';
import { Publisher } from './publisher/publisher';

@Injectable()
export class appService {
  constructor(private readonly publisher: Publisher) {}

  userSignup(data: UserDto) {
    const { userId, email, name, pass } = data;
    if (!userId || !email || !name || !pass)
      return { error: 'userId, email, name and pass required' };
    const routing = `user.signup`;
    const message = {
      eventId: 'evt_' + Date.now(),
      event: routing,
      timestamp: new Date().toISOString(),
      payload: { userId, email, name },
      meta: {},
    };
    console.log(message);
    this.publisher.publish(`${routing}.email`, message);
    return 'User signup published';
  }
  notify(data: NotifyDto) {
    const { type, template, to, payload, meta } = data;
    if (!type || !to) return { error: 'type and to required' };
    const routing = `notify.${type}`;
    const message = {
      eventId: 'evt_' + Date.now(),
      event: 'notify.custom',
      timestamp: new Date().toISOString(),
      payload: { template, to, data: payload },
      meta: meta || {},
    };
    console.log(message);
    this.publisher.publish(routing, message);
    return { status: 'published', routingKey: routing };
  }

  order(data: OrderDto) {
    const { orderId, userId, email, amount, items } = data;
    if (!orderId || !userId || !email)
      return { error: 'orderId, userId and email required' };
    const routing = `order.completed`;
    const message = {
      eventId: 'evt_' + Date.now(),
      event: routing,
      timestamp: new Date().toISOString(),
      payload: { orderId, userId, email, amount, items },
    };
    console.log(message);
    this.publisher.publish(`${routing}.email`, message);
    return { status: 'published', routingKey: routing };
  }
}
