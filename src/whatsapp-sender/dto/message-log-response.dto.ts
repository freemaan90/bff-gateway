export class MessageLogResponseDto {
  id: string;
  phone: string;
  messageText: string;
  sessionId: string | null;
  sentAt: string; // ISO 8601
}

export class FailedMessageLogResponseDto {
  id: string;
  phone: string;
  messageText: string;
  sessionId: string | null;
  failureReason: string;
  failedAt: string; // ISO 8601
}
