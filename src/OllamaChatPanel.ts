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
        :root {
            --user-bubble: #0078d4;
            --bot-bubble: #f3f3f3;
            --user-text: white;
            --bot-text: #333;
        }

        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen,
                        Ubuntu, Cantarell, 'Open Sans', 'Helvetica Neue', sans-serif;
            padding: 0;
            margin: 0;
            background-color: var(--vscode-editor-background);
            color: var(--vscode-editor-foreground);
            height: 100vh;
            display: flex;
            flex-direction: column;
        }

        #chat-container {
            display: flex;
            flex-direction: column;
            height: 100%;
            padding: 16px;
            box-sizing: border-box;
        }

        #messages {
            flex-grow: 1;
            overflow-y: auto;
            padding: 8px 0;
            display: flex;
            flex-direction: column;
            gap: 12px;
        }

        .message {
            max-width: 80%;
            padding: 12px 16px;
            border-radius: 18px;
            line-height: 1.4;
            position: relative;
            word-wrap: break-word;
        }

        .user-message {
            align-self: flex-end;
            background-color: var(--user-bubble);
            color: var(--user-text);
            border-bottom-right-radius: 4px;
            margin-left: 20%;
        }

        .bot-message {
            align-self: flex-start;
            background-color: var(--bot-bubble);
            color: var(--bot-text);
            border-bottom-left-radius: 4px;
            margin-right: 20%;
        }

        #input-area {
            display: flex;
            gap: 8px;
            padding: 16px 0;
            border-top: 1px solid var(--vscode-input-border);
            margin-top: 8px;
        }

        #question-input {
            flex-grow: 1;
            padding: 10px 16px;
            border: 1px solid var(--vscode-input-border);
            border-radius: 20px;
            background-color: var(--vscode-input-background);
            color: var(--vscode-input-foreground);
            outline: none;
        }

        #send-button {
            padding: 10px 20px;
            background-color: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: none;
            border-radius: 20px;
            cursor: pointer;
            transition: background-color 0.2s;
        }

        #send-button:hover {
            background-color: var(--vscode-button-hoverBackground);
        }

        #code-context {
            font-family: var(--vscode-editor-font-family);
            font-size: 0.9em;
            background-color: var(--vscode-textBlockQuote-background);
            padding: 12px;
            border-radius: 8px;
            margin-bottom: 16px;
            max-height: 150px;
            overflow-y: auto;
            white-space: pre-wrap;
        }

        /* 滚动条样式 */
        ::-webkit-scrollbar {
            width: 8px;
        }

        ::-webkit-scrollbar-track {
            background: var(--vscode-scrollbarSlider-background);
        }

        ::-webkit-scrollbar-thumb {
            background: var(--vscode-scrollbarSlider-activeBackground);
            border-radius: 4px;
        }

        /* 响应式调整 */
        @media (max-width: 600px) {
            .message {
                max-width: 90%;
            }
        }
    </style>
</head>
<body>
    <div id="chat-container">
        <div id="code-context"></div>
        <div id="messages"></div>
        <div id="input-area">
            <input id="question-input" placeholder="Type your question here..." autofocus>
            <button id="send-button">Send</button>
        </div>
    </div>

    <script>
        (function() {
            const vscode = acquireVsCodeApi();
            let currentCode = '';

            // 添加时间戳
            function getTime() {
                const now = new Date();
                return now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            }

            // 更安全的DOM操作函数
            function addMessage(text, sender) {
                const messagesDiv = document.getElementById('messages');
                if (!messagesDiv) return;

                const messageDiv = document.createElement('div');
                messageDiv.classList.add('message');
                messageDiv.classList.add(sender + '-message');
                messageDiv.textContent = text;

                // 添加消息内容
                const content = document.createElement('div');
                content.textContent = text;

                // 添加时间戳
                const time = document.createElement('div');
                time.className = 'message-time';
                time.textContent = getTime();
                time.style.fontSize = '0.8em';
                time.style.opacity = '0.7';
                time.style.marginTop = '4px';
                time.style.textAlign = sender === 'user' ? 'right' : 'left';


                messageDiv.appendChild(time);
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