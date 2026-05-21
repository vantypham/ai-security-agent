import axios from "axios";
import * as vscode from "vscode";

export interface SuggestFixRequest {
  rule_id: string;
  code: string;
  file_path?: string;
  language?: string;
}

export interface SuggestFixResponse {
  severity: string;
  owasp: string;
  explanation: string;
  fixed_code: string;
}

export async function callBackend(
  request: SuggestFixRequest,
): Promise<SuggestFixResponse> {
  const config = vscode.workspace.getConfiguration("ai-security");
  const backendUrl = config.get<string>("backendUrl", "http://localhost:8000");
  try {
    console.log("AI Security Request:", request);
    const response = await axios.post(
      `${backendUrl}/suggest-fix`,
      request,
      {
        headers: {
          "Content-Type": "application/json",
        },
        timeout: 30000,
      },
    );
    console.log("AI Security Response:", response.data);
    return response.data;
  } catch (error: any) {
    console.error("Backend Error:", error);
    /*
     * FastAPI validation errors
     */
    if (error.response) {
      const status = error.response.status;
      const detail = JSON.stringify(error.response.data);
      vscode.window.showErrorMessage(`AI backend error (${status}): ${detail}`);
    } else {
      vscode.window.showErrorMessage("Cannot connect to AI backend");
    }
    throw error;
  }
}
