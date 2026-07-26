import { logger } from '../utils/logger';
import { geminiLiveService } from '../services/gemini-live/GeminiLiveService';
import { GeminiLiveSession } from '../services/gemini-live/GeminiLiveSession';

export interface ChatMessage {
  role: 'user' | 'model' | 'system';
  content: string;
}

/**
 * Infispark AI Customer Representative Agent (Powered by Gemini Live API)
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
   * Initialize a Gemini Live WebSocket Session for an active WhatsApp call
   */
  public async initializeLiveSession(callId: string): Promise<GeminiLiveSession> {
    logger.info(`[InfisparkAgent] Initializing Gemini Live real-time streaming session for call ${callId}`);

    // System prompt sent ONLY ONCE when call starts
    const session = await geminiLiveService.createSession({
      callId,
      systemInstruction: this.systemPrompt,
      voiceName: 'Puck',
    });

    let history = this.conversationHistories.get(callId);
    if (!history) {
      history = [{ role: 'system', content: this.systemPrompt }];
      this.conversationHistories.set(callId, history);
    }

    session.on('text', (textTranscript: string) => {
      if (history) {
        history.push({ role: 'model', content: textTranscript });
      }
    });

    return session;
  }

  /**
   * Fallback text user speech processor if WebRTC audio stream fallback occurs
   */
  public async processUserSpeech(callId: string, userText: string): Promise<string> {
    logger.info(`[InfisparkAgent] Call ${callId} user text input: "${userText}"`);

    let history = this.conversationHistories.get(callId);
    if (!history) {
      history = [{ role: 'system', content: this.systemPrompt }];
      this.conversationHistories.set(callId, history);
    }
    history.push({ role: 'user', content: userText });

    const liveSession = geminiLiveService.getSession(callId);
    if (liveSession && liveSession.getIsConnected()) {
      liveSession.sendTextMessage(userText);
      return 'Processing request via Gemini Live API...';
    }

    return this.generateSmartFallback(userText);
  }

  /**
   * Context-aware fallback response generator when API rate limits or connection errors occur
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
   * Clear session history and close Live Session when call terminates
   */
  public clearSession(callId: string): void {
    geminiLiveService.closeSession(callId);
    this.conversationHistories.delete(callId);
    logger.debug(`[InfisparkAgent] Cleared conversation history and closed live session for call ${callId}`);
  }
}

export const infisparkAgent = new InfisparkAgent();
