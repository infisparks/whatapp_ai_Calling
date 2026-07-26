import { env } from '../config/env.config';
import { logger } from '../utils/logger';

export interface ChatMessage {
  role: 'user' | 'model' | 'system';
  content: string;
}

/**
 * Infispark AI Customer Representative Agent (Powered by Gemini API)
 */
export class InfisparkAgent {
  private systemPrompt = `You are Maya, an intelligent AI Customer Representative and Team Member at Infispark (Domain: infispark.in).

Your Goals:
1. Greet callers warmly on behalf of Infispark.
2. Provide concise, professional, and friendly information about Infispark's services:
   - AI Solutions & Custom Voice Agents
   - Web & Mobile App Development
   - Cloud & DevOps Infrastructure
   - Enterprise Software Solutions & IT Consulting
3. Help callers schedule a consultation or meeting with the Infispark tech team.
4. Keep your replies concise (1 to 3 short sentences maximum) because your responses will be spoken aloud to the caller over a voice phone call.
5. Speak in a natural, polite tone. Support English and Hindi seamlessly based on the language the customer speaks.
6. Never make up fake promises or guarantees. If asked about custom pricing or specialized projects, offer to schedule a call with an Infispark team member.`;

  private conversationHistories: Map<string, ChatMessage[]> = new Map();

  /**
   * Generate an initial greeting when call connects
   */
  public getInitialGreeting(): string {
    return 'Hello! Thank you for calling Infispark. My name is Maya from the Infispark team. How can I assist you with your project today?';
  }

  /**
   * Process user speech input and return AI text response
   */
  public async processUserSpeech(callId: string, userText: string): Promise<string> {
    logger.info(`[InfisparkAgent] Call ${callId} user input: "${userText}"`);

    // Get or initialize conversation history for this call
    let history = this.conversationHistories.get(callId);
    if (!history) {
      history = [{ role: 'system', content: this.systemPrompt }];
      this.conversationHistories.set(callId, history);
    }

    history.push({ role: 'user', content: userText });

    if (!env.GEMINI_API_KEY || env.GEMINI_API_KEY.includes('dummy')) {
      logger.warn('[InfisparkAgent] Gemini API key not set or dummy. Using fallback representative response.');
      const fallbackReply = 'Thank you for reaching out to Infispark! We specialize in custom AI agents, web applications, and software development. Would you like to schedule a consultation with our technical team?';
      history.push({ role: 'model', content: fallbackReply });
      return fallbackReply;
    }

    try {
      // Call Gemini 2.5 Flash API endpoint
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${env.GEMINI_API_KEY}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [
              {
                role: 'user',
                parts: [{ text: `${this.systemPrompt}\n\nUser Question: ${userText}` }],
              },
            ],
            generationConfig: {
              temperature: 0.7,
              maxOutputTokens: 150,
            },
          }),
        }
      );

      const data = (await response.json()) as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };

      const firstCandidate = data.candidates?.[0];
      const textResponse = firstCandidate?.content?.parts?.[0]?.text;

      if (response.ok && textResponse) {
        const aiReply = textResponse.trim();
        logger.info(`[InfisparkAgent] Gemini response for ${callId}: "${aiReply}"`);
        history.push({ role: 'model', content: aiReply });
        return aiReply;
      } else {
        logger.error('[InfisparkAgent] Gemini API error response:', data);
        const defaultReply = 'Infispark offers end-to-end AI and web development solutions. How can our team help your business today?';
        history.push({ role: 'model', content: defaultReply });
        return defaultReply;
      }
    } catch (error) {
      logger.error(`[InfisparkAgent] Exception generating response for ${callId}:`, { error });
      return 'Thank you for calling Infispark. We offer custom AI and software solutions. Would you like us to arrange a callback from our team?';
    }
  }

  /**
   * Clear session history when call terminates
   */
  public clearSession(callId: string): void {
    this.conversationHistories.delete(callId);
    logger.debug(`[InfisparkAgent] Cleared conversation history for call ${callId}`);
  }
}

export const infisparkAgent = new InfisparkAgent();
