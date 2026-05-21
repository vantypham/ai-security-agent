import * as vscode from "vscode";
import { exec } from "child_process";
import { SecurityCodeActionProvider } from "./SecurityCodeActionProvider";
import { callBackend } from "./backend";

let diagnosticCollection: vscode.DiagnosticCollection;
let timeout: NodeJS.Timeout | undefined;

export function activate(context: vscode.ExtensionContext): void {
  console.log("AI Security Agent activated");
  diagnosticCollection =
    vscode.languages.createDiagnosticCollection("ai-security");
  context.subscriptions.push(diagnosticCollection);
  /*
   * Manual Scan
   */
  const scanCommand = vscode.commands.registerCommand(
    "ai-security-agent.scan",
    runScan,
  );

  context.subscriptions.push(scanCommand);
  /*
   * Auto scan on save
   */
  const saveListener = vscode.workspace.onDidSaveTextDocument(async () => {
    const config = vscode.workspace.getConfiguration("ai-security");
    const enableAutoScan = config.get<boolean>("enableAutoScan", false);
    if (!enableAutoScan) {
      return;
    }
    if (timeout) {
      clearTimeout(timeout);
    }
    timeout = setTimeout(async () => {
      console.log("Auto project scan");
      await runScan();
    }, 500);
  });

  context.subscriptions.push(saveListener);

  /*
   * Quick Fix provider
   */
  context.subscriptions.push(
    vscode.languages.registerCodeActionsProvider(
      "*",
      new SecurityCodeActionProvider(),
      {
        providedCodeActionKinds: [vscode.CodeActionKind.QuickFix],
      },
    ),
  );

  /*
   * Suggest Fix
   */
  const suggestFixCommand = vscode.commands.registerCommand(
    "ai-security.suggestFix",

    async (diagnostic?: vscode.Diagnostic) => {
      const editor = vscode.window.activeTextEditor;

      if (!editor) {
        return;
      }
      const range = diagnostic?.range ?? editor.selection;
      ////////////////////
      const startLine = Math.max(range.start.line - 3, 0);

      const endLine = Math.min(
        range.end.line + 3,
        editor.document.lineCount - 1,
      );

      const contextRange = new vscode.Range(
        startLine,
        0,

        endLine,
        editor.document.lineAt(endLine).text.length,
      );

      const vulnerableCode = editor.document.getText(contextRange);
      /////////////////////////////////
      //   const vulnerableCode = editor.document.getText(range);

      //   console.log(
      //     "Selected range:",
      //     contextRange.start.line,
      //     contextRange.start.character,
      //     contextRange.end.line,
      //     contextRange.end.character,
      //   );

      console.log("Selected code:", vulnerableCode);

      try {
        // await vscode.window.withProgress(
        //   {
        //     location: vscode.ProgressLocation.Notification,

        //     title: "Getting AI Fix...",
        //   },

        //   async () => {
        //     console.log("Calling backend API");
        //     console.log("Sending request:", {
        //       rule_id: String(diagnostic?.code),

        //       code: vulnerableCode,

        //       file_path: editor.document.uri.fsPath,

        //       language: editor.document.languageId,
        //     });
        //     //endlog

        //     const response = await callBackend({
        //       rule_id: String(diagnostic?.code ?? "unknown"),

        //       code: vulnerableCode,

        //       file_path: editor.document.uri.fsPath,

        //       language: editor.document.languageId,
        //     });

        //     await showSuggestion(response, range);
        //   },
        // );
        await vscode.window.withProgress(
          {
            location: vscode.ProgressLocation.Notification,
            title: "Getting AI Fix...",
          },
          async (progress) => {
            try {
              progress.report({
                message: "Calling backend...",
              });

              const response = await callBackend({
                rule_id: String(diagnostic?.code ?? "unknown"),
                code: vulnerableCode,
                file_path: editor.document.uri.fsPath,
                language: editor.document.languageId,
              });

              progress.report({
                message: "Preparing fix...",
              });

              await showSuggestion(response, range); //range

              return; // 🔥 IMPORTANT: ensures clean exit
            } catch (err) {
              console.error(err);

              vscode.window.showErrorMessage("Unable to get AI fix");

              throw err; // 🔥 forces progress to close correctly
            }
          },
        );
      } catch (err) {
        console.error(err);

        vscode.window.showErrorMessage("Unable to get AI fix");
      }
    },
  );

  context.subscriptions.push(suggestFixCommand);
}

/*
 * Run Semgrep
 */
async function runScan() {
  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (!workspaceFolders) {
    vscode.window.showErrorMessage("No workspace opened");
    return;
  }
  const config = vscode.workspace.getConfiguration("ai-security");
  const semgrepPath = config.get<string>("semgrepPath");
  if (!semgrepPath) {
    vscode.window.showErrorMessage("Semgrep path not configured");
    return;
  }

  const projectPath = workspaceFolders[0].uri.fsPath;
  //   const command = `"${semgrepPath}" scan --config auto "${projectPath}" --json`;
  //   console.log("Running:", command);
  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: "AI Security scanning...",
      cancellable: false,
    },
    (progress, token) => {
      return new Promise<void>((resolve, reject) => {
        progress.report({
          message: "Running Semgrep...",
        });
        const command = `"${semgrepPath}" scan --config auto "${projectPath}" --json`;
        exec(command, (error, stdout, stderr) => {
          if (error) {
            vscode.window.showErrorMessage(
              `Scan failed: ${stderr || error.message}`,
            );
            reject(error);
            return;
          }
          try {
            progress.report({
              message: "Processing results...",
            });
            const result = JSON.parse(stdout);
            const findings = result.results || [];
            diagnosticCollection.clear();
            populateDiagnostics(findings);
            vscode.window.showInformationMessage(
              `Found ${findings.length} issues`,
            );
            resolve();
          } catch (err) {
            vscode.window.showErrorMessage("Failed to parse Semgrep output");
            reject(err);
          }
        });
      });
    },
  );

  //   vscode.window.withProgress(
  //     {
  //       location: vscode.ProgressLocation.Notification,
  //       title: "AI Security",
  //       cancellable: false,
  //     },
  //     async (resolve, reject) => {
  //       const command = `"${semgrepPath}" scan --config auto "${projectPath}" --json`;
  //       console.log("Running:", command);
  //       vscode.window.showInformationMessage("Scanning is in-progresssssss...");

  //       exec(
  //         command,
  //         (error, stdout, stderr) => {
  //           if (error) {
  //             vscode.window.showErrorMessage(
  //               `Scan failed:
  //                     ${stderr || error.message}`,
  //             );

  //             return;
  //           }

  //           try {
  //             const result = JSON.parse(stdout);

  //             const findings = result.results || [];

  //             diagnosticCollection.clear();

  //             populateDiagnostics(findings);
  //           } catch (err) {
  //             console.error(err);

  //             vscode.window.showErrorMessage("Unable to parse scan result");
  //           }
  //         },
  //       );

  //     },
  //   );
}

/*
 * Create diagnostics
 */
function populateDiagnostics(findings: any[]) {
  const fileMap = new Map<string, vscode.Diagnostic[]>();
  findings.forEach((finding) => {
    const filePath = finding.path;
    const range = new vscode.Range(
      new vscode.Position(finding.start.line - 1, finding.start.col - 1),
      new vscode.Position(finding.end.line - 1, finding.end.col - 1),
    );
    const diagnostic = new vscode.Diagnostic(
      range,
      `[${finding.check_id}]
                 ${finding.extra.message}`,

      vscode.DiagnosticSeverity.Error,
    );
    diagnostic.source = "AI Security";
    diagnostic.code = finding.check_id;
    if (!fileMap.has(filePath)) {
      fileMap.set(filePath, []);
    }
    fileMap.get(filePath)?.push(diagnostic);
  });

  fileMap.forEach((diagnostics, filePath) => {
    diagnosticCollection.set(vscode.Uri.file(filePath), diagnostics);
  });
}

/*
 * Show AI suggestion
 */
async function showSuggestion(result: any, range: vscode.Range) {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    return;
  }
  if (!result?.fixed_code) {
    vscode.window.showErrorMessage("AI returned empty fix");
    return;
  }

  const message = `
    Severity: ${result.severity}
    OWASP: ${result.owasp}
    Explanation:
    ${result.explanation}
    `;

  const choice = await vscode.window.showInformationMessage(
    message || "AI Suggestion ready",
    {modal: true,},
    "Apply Fix",
  );
  if (choice !== "Apply Fix") {
    return;
  }
  if (choice === "Apply Fix") {
    const edit = new vscode.WorkspaceEdit();
    edit.replace(
      editor.document.uri,
      range,
      result.fixed_code, // 🔥 FIXED (snake_case)
    );
    const success = await vscode.workspace.applyEdit(edit);
    if (!success) {
      vscode.window.showErrorMessage("Failed to apply fix");
    }
  }
}

//OLD
// async function showSuggestion(result: any, range: vscode.Range) {
//   const editor = vscode.window.activeTextEditor;

//   if (!editor) {
//     return;
//   }

//   const choice = await vscode.window.showInformationMessage(
//     `Severity: ${result.severity}

// OWASP: ${result.owasp}

// ${result.explanation}`,

//     "Apply Fix",
//   );

//   if (choice === "Apply Fix") {
//     const edit = new vscode.WorkspaceEdit();

//     edit.replace(
//       editor.document.uri,

//       range,

//       result.fixed_code,
//     );

//     await vscode.workspace.applyEdit(edit);
//   }
// }

export function deactivate() {
  console.log("AI Security Agent deactivated");
}
