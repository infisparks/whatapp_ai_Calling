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
  private systemPrompt = `You are Maya, an intelligent AI Voice Representative for Infispark (infispark.in).

CRITICAL CONVERSATIONAL RULES:
1. Infispark specializes in: Custom AI Voice Agents, Web & Mobile App Development, Cloud & DevOps, and Enterprise Software Solutions.
2. The caller is on a LIVE phone call. Respond directly to their specific question in 1 to 2 SHORT, complete sentences.
3. NEVER repeat "Namaste! We are Infispark" or repeat introductory greetings once the call has started.
4. If the caller asks what Infispark does or what your job is ("tum kya kaam karte ho / what do you do"), answer directly: "Infispark builds custom AI voice agents, web and mobile apps, and cloud software. Would you like to schedule a free consultation with our tech team?"
5. If the caller says "stop" or wants to talk, say: "Sure, go ahead! I am listening."
6. If the caller speaks Hindi/Hinglish, reply in clear, friendly Hinglish (e.g., "Infispark ek tech company hai jo custom AI voice call agents, website, aur mobile apps banati hai. Aap batayein hum aapki kya madad kar sakte hain?").
7. Always complete your sentence cleanly.`;

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
      logger.warn('[InfisparkAgent] Gemini API key not set or dummy.');
      return this.generateSmartFallback(userText);
    }

    const modelsToTry = [
      'gemini-2.0-flash-lite',
      'gemini-1.5-flash-8b',
      'gemini-2.0-flash',
      'gemini-1.5-flash',
      'gemini-2.5-flash',
    ];

    const userModelTurns = history.filter((m) => m.role === 'user' || m.role === 'model');
    const dialogueHistoryText = userModelTurns
      .slice(-6)
      .map((m) => `${m.role === 'user' ? 'Caller' : 'Maya'}: ${m.content}`)
      .join('\n');

    const contentsPayload = [
      {
        role: 'user',
        parts: [
          {
            text: `${this.systemPrompt}\n\nRecent Conversation History:\n${dialogueHistoryText}\n\nLatest Caller Question: "${userText}"\n\nMaya (Direct short answer in 1-2 complete sentences):`,
          },
        ],
      },
    ];

    for (const modelName of modelsToTry) {
      try {
        const response = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${env.GEMINI_API_KEY}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: contentsPayload,
              generationConfig: {
                temperature: 0.7,
                maxOutputTokens: 200,
              },
            }),
          }
        );

        const data = (await response.json()) as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>; error?: any };

        const firstCandidate = data.candidates?.[0];
        const textResponse = firstCandidate?.content?.parts?.[0]?.text;

        if (response.ok && textResponse) {
          const aiReply = textResponse.trim();
          logger.info(`[InfisparkAgent] Gemini (${modelName}) response for ${callId}: "${aiReply}"`);
          history.push({ role: 'model', content: aiReply });
          return aiReply;
        } else {
          logger.warn(`[InfisparkAgent] Model ${modelName} returned error:`, data.error?.message || data);
        }
      } catch (err) {
        logger.error(`[InfisparkAgent] Exception calling ${modelName}:`, { err });
      }
    }

    // Smart fallback if all API models fail / 429 rate limited
    const smartFallback = this.generateSmartFallback(userText);
    history.push({ role: 'model', content: smartFallback });
    return smartFallback;
  }

  /**
   * Context-aware fallback response generator when API rate limits hit
   */
  private generateSmartFallback(userText: string): string {
    const lower = userText.toLowerCase();

    if (lower.includes('team') || lower.includes('member') || lower.includes('many') || lower.includes('people')) {
      return 'Infispark has a team of senior AI engineers, web developers, and cloud architects. How many team members do you need for your project?';
    }

    if (lower.includes('stop') || lower.includes('chup') || lower.includes('listen') || lower.includes('hear')) {
      return 'I am sorry! I am listening now. Please tell me how I can help you.';
    }

    if (lower.includes('do') || lower.includes('work') || lower.includes('job') || lower.includes('kaam') || lower.includes('park')) {
      return 'Infispark develops custom AI voice agents, web applications, and cloud software for businesses. Would you like to schedule a free consultation with our tech team?';
    }

    if (lower.includes('price') || lower.includes('cost') || lower.includes('rate') || lower.includes('charge')) {
      return 'We offer custom packages based on your project requirements. Would you like to schedule a consultation with our technical team?';
    }

    if (lower.includes('hello') || lower.includes('hi') || lower.includes('hey')) {
      return 'Hello! Thank you for calling Infispark. How can our team assist you with your project today?';
    }

    return 'Infispark specializes in custom AI voice call agents and web application development. How can we help your business today?';
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
