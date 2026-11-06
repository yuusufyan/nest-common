// Shared by every NestJS producer of notification-worthy events AND by
// the notification consumer service — one literal queue name both sides
// must agree on, since the sibling Go package's RabbitMQ client
// is direct-to-queue, not topic/fanout. Any Go producer
// copies this exact string (no cross-language shared-constants file exists
// today — the same is already true of other
// cross-language queues, hardcoded independently on each side).
export const NOTIFICATIONS_QUEUE_NAME = 'notifications.events_queue';
