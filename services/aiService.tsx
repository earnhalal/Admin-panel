import { User } from '../pages/UsersPage';

// Using any because the type is from a dynamic import.
// The AI client will be initialized on first use, not on module load.
let ai: any;
let genaiTypes: any;

const getAiClient = async () => {
  if (!ai) {
    // Dynamically import the module only when it's needed for the first time.
    // This prevents browser-related issues on initial app load if the library
    // has dependencies on a Node.js environment.
    const genaiModule = await import('@google/genai');
    const { GoogleGenAI } = genaiModule;
    genaiTypes = genaiModule;
    
    // Assume process.env.API_KEY is available in the execution environment
    ai = new GoogleGenAI({ apiKey: process.env.API_KEY! });
  }
  return ai;
};

const model = 'gemini-2.5-flash';

export const decideReferralApproval = async (referredUser: User): Promise<'APPROVE' | 'REJECT' | 'ERROR'> => {
  try {
    const prompt = `You are an automated decision-making AI for an admin panel. Your task is to decide if a referral bonus should be approved. A bonus is approved ONLY IF the referred user has a 'verified' payment status. 
    
    Here is the data for the referred user:
    - Email: ${referredUser.email}
    - Payment Status: ${referredUser.paymentStatus}
    
    Based on this information, should the bonus be approved? Respond with only the word 'APPROVE' or 'REJECT'.`;

    const aiClient = await getAiClient();
    const response = await aiClient.models.generateContent({
        model: model,
        contents: prompt,
    });
    
    const decision = response.text.trim().toUpperCase();

    if (decision.includes('APPROVE')) {
      return 'APPROVE';
    }
    if (decision.includes('REJECT')) {
      return 'REJECT';
    }
    
    console.warn("AI returned an invalid decision, using fallback logic:", response.text);
    // Fallback logic based on rules if AI gives an unclear answer
    return referredUser.paymentStatus === 'verified' ? 'APPROVE' : 'REJECT';
    
  } catch (error) {
    console.error("Error calling Gemini API for referral, using fallback logic:", error);
    // Fallback logic on API error
    if(referredUser.paymentStatus === 'verified'){
        return 'APPROVE';
    }
    return 'ERROR'; // Return error if we can't be sure
  }
};


export const decideTaskApproval = async (submission: { userEmail?: string, taskTitle?: string }): Promise<'APPROVE' | 'REJECT' | 'ERROR'> => {
    try {
      const prompt = `You are an automated decision-making AI for an admin panel. Your task is to decide if a task submission should be approved. The current policy is to approve these submissions by default because there is no user-submitted proof to verify for this task type. 
      
      Here is the data:
      - User Email: ${submission.userEmail}
      - Task Title: ${submission.taskTitle}
      
      Based on the policy of default approval for this task type, should this submission be approved? Respond with only the word 'APPROVE'.`;
  
      const aiClient = await getAiClient();
      const response = await aiClient.models.generateContent({
        model: model,
        contents: prompt,
      });

      const decision = response.text.trim().toUpperCase();
  
      if (decision.includes('APPROVE')) {
        return 'APPROVE';
      }
      
      console.warn("AI returned an invalid decision, using fallback:", response.text);
      // Fallback: Default to approve as per the prompt's instructions
      return 'APPROVE';
    } catch (error) {
      console.error("Error calling Gemini API for task, using fallback:", error);
      // Fallback on API error: Default to approve as per the policy.
      return 'APPROVE';
    }
  };

export const generateTaskWithAi = async (prompt: string): Promise<{ title: string; description: string; reward: number; }> => {
    try {
        const aiClient = await getAiClient();
        const { Type } = genaiTypes;

        const response = await aiClient.models.generateContent({
            model: model,
            contents: `You are an expert task creator for a micro-task platform in Pakistan. Based on the user's request, create a concise, clear, and engaging task. Provide a title, a detailed step-by-step description, and a fair reward in Pakistani Rupees (Rs).
            
            User Request: "${prompt}"
            
            Generate the task details in JSON format.`,
            config: {
                responseMimeType: "application/json",
                responseSchema: {
                    type: Type.OBJECT,
                    properties: {
                        title: { type: Type.STRING, description: "A short, catchy title for the task." },
                        description: { type: Type.STRING, description: "A detailed, step-by-step guide for the user to complete the task." },
                        reward: { type: Type.NUMBER, description: "A fair and reasonable reward amount in Pakistani Rupees (Rs)." }
                    },
                    required: ["title", "description", "reward"]
                }
            }
        });
        
        const jsonText = response.text.trim();
        const parsedJson = JSON.parse(jsonText);

        if (typeof parsedJson.title === 'string' && typeof parsedJson.description === 'string' && typeof parsedJson.reward === 'number') {
            return parsedJson;
        } else {
            throw new Error("AI response did not match the expected format.");
        }
    } catch (error) {
        console.error("Error calling Gemini API for task generation:", error);
        throw new Error("Failed to generate task with AI. Please try again.");
    }
};

export const generateSmartReport = async (stats: any): Promise<string> => {
    try {
        const prompt = `You are a business analyst AI. Given the following key metrics for a micro-task app, provide a brief, insightful summary of the app's current state and suggest ONE actionable recommendation. Be concise, use bullet points for the summary, and keep the language simple and clear.

        Key Metrics:
        - Total Users: ${stats.userCount ?? 'N/A'}
        - Total User Balance: Rs ${stats.totalBalance?.toFixed(2) ?? 'N/A'}
        - Total Withdrawn: Rs ${stats.totalWithdrawn?.toFixed(2) ?? 'N/A'}
        - Pending Withdrawals: ${stats.pendingWithdrawals ?? 'N/A'}
        - Pending Task Submissions: ${stats.pendingSubmissions ?? 'N/A'}
        
        Generate the report.`;

        const aiClient = await getAiClient();
        const response = await aiClient.models.generateContent({
            model: model,
            contents: prompt,
        });
        
        return response.text.trim();
    } catch (error) {
        console.error("Error calling Gemini API for smart report:", error);
        throw new Error("Failed to generate AI report. Please try again later.");
    }
};

export interface SuspiciousUser {
    userId: string;
    email: string;
    reason: string;
}

export const runFraudDetection = async (users: User[]): Promise<SuspiciousUser[]> => {
    try {
        const aiClient = await getAiClient();
        const { Type } = genaiTypes;
        
        const userData = users.map(u => ({
            id: u.id,
            email: u.email,
            createdAt: u.createdAt?.toDate().toISOString() ?? 'N/A',
        }));

        const prompt = `You are a fraud detection AI for a micro-task app. Analyze the following list of users. Identify users who are potentially fraudulent. A key fraudulent pattern is multiple accounts registered very close together in time (e.g., within a few minutes of each other). Also look for very similar email addresses that are not from common providers. Return a JSON array of suspicious users. Each object should have 'userId', 'email', and a brief 'reason' for suspicion. If no users seem suspicious, return an empty array.
        
        User Data: ${JSON.stringify(userData)}
        `;

        const response = await aiClient.models.generateContent({
            model: model,
            contents: prompt,
            config: {
                responseMimeType: "application/json",
                responseSchema: {
                    type: Type.ARRAY,
                    items: {
                        type: Type.OBJECT,
                        properties: {
                            userId: { type: Type.STRING },
                            email: { type: Type.STRING },
                            reason: { type: Type.STRING }
                        },
                        required: ["userId", "email", "reason"]
                    }
                }
            }
        });

        const jsonText = response.text.trim();
        const parsedJson = JSON.parse(jsonText);

        if (Array.isArray(parsedJson)) {
            return parsedJson as SuspiciousUser[];
        } else {
             throw new Error("AI response was not a valid array.");
        }
    } catch (error) {
        console.error("Error calling Gemini API for fraud detection:", error);
        throw new Error("Failed to run fraud detection scan. Please try again.");
    }
};