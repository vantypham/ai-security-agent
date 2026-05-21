import * as vscode from "vscode";

export class SecurityCodeActionProvider implements vscode.CodeActionProvider {
  provideCodeActions(document: vscode.TextDocument, range: vscode.Range) {
    const explainAction = new vscode.CodeAction(
      "AI:Explain Security Issue",
      vscode.CodeActionKind.QuickFix,
    );

    explainAction.command = {
      command: "ai-security.explain",
      title: "Explain",
    };

    const fixAction = new vscode.CodeAction(
      "AI:Suggest Fix",
      vscode.CodeActionKind.QuickFix,
    );

    fixAction.command = {
      command: "ai-security.suggestFix",
      title: "Suggest Fix",
    };

    return [explainAction, fixAction];
  }
}
