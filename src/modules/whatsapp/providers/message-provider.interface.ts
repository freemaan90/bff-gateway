export interface SendResult {
  success: boolean;
  wamid?: string; // WhatsApp Message ID (solo canal oficial)
  error?: string;
}

export interface SendMessageOptions {
  templateName?: string;
  languageCode?: string;
  templateComponents?: object[];
}

export interface IMessageProvider {
  sendMessage(
    phone: string,
    message: string,
    options?: SendMessageOptions,
  ): Promise<SendResult>;
}
