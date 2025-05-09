import * as vscode from 'vscode';
import axios from 'axios';

declare const acquireVsCodeApi: () => any;
interface Window {
    acquireVsCodeApi: typeof acquireVsCodeApi;
}

export class OllamaChatPanel {
    private static instance: OllamaChatPanel | undefined;
    private readonly panel: vscode.WebviewPanel;
    private readonly extensionUri: vscode.Uri;

    public static createOrShow(context: vscode.ExtensionContext, code: string) {
        if (OllamaChatPanel.instance) {
            OllamaChatPanel.instance.panel.reveal();
            OllamaChatPanel.instance.updateCode(code);
            return;
        }

        OllamaChatPanel.instance = new OllamaChatPanel(context, code);
    }

    private constructor(
        contextOrPanel: vscode.ExtensionContext | vscode.WebviewPanel,
        codeOrExtensionUri?: string | vscode.Uri
    ) {
        if ('subscriptions' in contextOrPanel) {
            // 这是常规构造路径 (ExtensionContext)
            this.extensionUri = contextOrPanel.extensionUri;
            const code = codeOrExtensionUri as string;

            this.panel = vscode.window.createWebviewPanel(
                'ollamaChat',
                'Ollama Chat',
                vscode.ViewColumn.Beside,
                {
                    enableScripts: true,
                    retainContextWhenHidden: true,
                    localResourceRoots: [this.extensionUri]
                }
            );

            this.setupWebview();
            this.setupEventListeners();
            this.updateCode(code);
        } else {
            // 这是 revive 路径 (WebviewPanel)
            this.panel = contextOrPanel;
            this.extensionUri = codeOrExtensionUri as vscode.Uri;

            this.setupWebview();
            this.setupEventListeners();
        }
    }

    private setupWebview() {
        this.panel.webview.html = this.getWebviewContent();
    }

    private setupEventListeners() {
        this.panel.webview.onDidReceiveMessage(async (message) => {
            switch (message.command) {
                case 'askQuestion':
                    await this.handleQuestion(message.code, message.question);
                    break;
            }
        });

        this.panel.onDidDispose(() => {
            OllamaChatPanel.instance = undefined;
        });
    }

    private async handleQuestion(code: string, question: string) {
        try {
            const response = await this.queryOllama(code, question);
            this.panel.webview.postMessage({
                command: 'response',
                answer: response
            });
        } catch (error) {
            this.panel.webview.postMessage({
                command: 'error',
                message: error instanceof Error ? error.message : 'Unknown error'
            });
        }
    }

    private async queryOllama(code: string, question: string): Promise<string> {
        const prompt = `
[INST] <<SYS>>
You are a helpful code assistant. Answer the user's question about the following code.
Provide clear, concise explanations and suggest improvements when appropriate.
<</SYS>>

Code:
${code}

Question: ${question}[/INST]

Answer:
`;

        const response = await axios.post('http://localhost:11434/api/generate', {
            model: 'codellama:7b-instruct-q4_K_M',
            prompt: prompt,
            max_tokens: 500,
            temperature: 0.3,
            stream: false
        });

        return response.data.response.trim();
    }

private getWebviewContent(): string {
    return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Ollama Chat</title>
    <style>
        /* 保持原有样式不变 */
    </style>
</head>
<body>
    <div id="chat-container">
        <div id="code-context"></div>
        <div id="messages"></div>
        <div id="input-area">
            <input id="question-input" placeholder="Ask about this code...">
            <button id="send-button">Send</button>
        </div>
    </div>

    <script>
        (function() {
            const vscode = acquireVsCodeApi();
            let currentCode = '';

            // 更安全的DOM操作函数
            function addMessage(text, sender) {
                const messagesDiv = document.getElementById('messages');
                if (!messagesDiv) return;

                const messageDiv = document.createElement('div');
                messageDiv.classList.add('message');
                messageDiv.classList.add(sender + '-message');
                messageDiv.textContent = text;
                messagesDiv.appendChild(messageDiv);
                messagesDiv.scrollTop = messagesDiv.scrollHeight;
            }

            // 处理来自扩展的消息
            window.addEventListener('message', event => {
                const message = event.data;
                switch (message.command) {
                    case 'setCode':
                        currentCode = message.code;
                        const codeContext = document.getElementById('code-context');
                        if (codeContext) codeContext.textContent = message.code;
                        break;
                    case 'response':
                        addMessage(message.answer, 'bot');
                        break;
                    case 'error':
                        addMessage('Error: ' + message.message, 'bot');
                        break;
                }
            });

            // 发送问题到扩展
            function sendQuestion() {
                const input = document.getElementById('question-input');
                if (!input) return;

                const question = input.value.trim();
                if (question && currentCode) {
                    addMessage(question, 'user');
                    vscode.postMessage({
                        command: 'askQuestion',
                        code: currentCode,
                        question: question
                    });
                    input.value = '';
                }
            }

            // 事件监听
            const sendButton = document.getElementById('send-button');
            if (sendButton) sendButton.addEventListener('click', sendQuestion);

            const questionInput = document.getElementById('question-input');
            if (questionInput) {
                questionInput.addEventListener('keypress', (e) => {
                    if (e.key === 'Enter') sendQuestion();
                });
            }
        })();
    </script>
</body>
</html>
`;
}

    private updateCode(code: string) {
        this.panel.webview.postMessage({
            command: 'setCode',
            code: code
        });
    }

    public static revive(panel: vscode.WebviewPanel, extensionUri: vscode.Uri) {
        OllamaChatPanel.instance = new OllamaChatPanel(panel, extensionUri);
    }
}