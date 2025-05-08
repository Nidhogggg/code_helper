import * as vscode from 'vscode';
import axios from 'axios';

// 使用模块级变量替代ExtensionContext属性
let triggeredByF1 = false;

export function activate(context: vscode.ExtensionContext) {
    const outputChannel = vscode.window.createOutputChannel('Ollama Code Completion');
    context.subscriptions.push(outputChannel);

    // 测试API连接
    axios.post('http://localhost:11434/api/generate', {
        model: 'codellama:7b-instruct-q4_K_M',
        prompt: 'test',
        max_tokens: 1,
        stream: false
    }).then(res => {
        console.log('API连接测试成功:', res.data);
    }).catch(err => {
        vscode.window.showErrorMessage('API连接测试失败: ' + err.message);
    });

    // 注册F1触发命令
    const triggerCommand = vscode.commands.registerCommand('ollama-code.triggerCompletion', () => {
        triggeredByF1 = true;
        vscode.commands.executeCommand('editor.action.inlineSuggest.trigger');
    });

    // 注册Tab确认命令
    const tabHandler = vscode.commands.registerCommand('ollama-code.acceptGhostText', () => {
        vscode.commands.executeCommand('editor.action.inlineSuggest.commit');
    });

    // 绑定Tab键到确认命令
    context.subscriptions.push(
        vscode.workspace.onDidChangeTextDocument(e => {
            if (e.contentChanges.some(change => change.text === '\t')) {
                vscode.commands.executeCommand('ollama-code.acceptGhostText');
            }
        })
    );

    // 测试命令是否可用
    vscode.commands.getCommands().then(commands => {
        if (!commands.includes('ollama-code.triggerCompletion')) {
            console.error('命令注册失败！');
        } else {
            console.log('命令已成功注册');
        }
    });

    // 注册内联补全提供程序
    const provider = vscode.languages.registerInlineCompletionItemProvider(
        ['python', 'javascript'],
        {
            async provideInlineCompletionItems(document: vscode.TextDocument, position: vscode.Position) {
                if (!triggeredByF1) {
                    return [];
                }

                // 重置触发标志
                triggeredByF1 = false;

                // 获取当前代码上下文
                const textBeforeCursor = document.getText(
                    new vscode.Range(
                        position.line, 0,
                        position.line, position.character
                    )
                );

                // 获取当前文件的所有 import 语句
                const imports = document.getText().match(/^import .+$/gm) || [];

                // 获取光标前后各3行的代码
                const surroundingCode = document.getText(
                    new vscode.Range(
                        new vscode.Position(Math.max(0, position.line - 3), 0),
                        new vscode.Position(Math.min(position.line + 3, document.lineCount), 0)
                    )
                );

                // 构造完整的提示词
                const fullPrompt = `
                    [Imports]
                    ${imports.join('\n')}

                    [Surrounding Code]
                    ${surroundingCode}

                    [Current Context]
                    ${textBeforeCursor}

                    Generate code completion:
                `;

                try {
                    // 调用本地Ollama API
                    const response = await axios.post('http://localhost:11434/api/generate', {
                        model: 'codellama:7b-instruct-q4_K_M',
                        prompt: fullPrompt,
                        max_tokens: 50,
                        temperature: 0.3,
                        stream: false
                    });

                    console.log('Prompt:', fullPrompt);
                    console.log('Full API Response:', response.data);

                    const suggestion = response.data.response.trim();
                    const item = new vscode.InlineCompletionItem(
                        new vscode.SnippetString(suggestion)
                    );

                    // 添加样式控制
                    item.range = new vscode.Range(
                        position,
                        position.translate(0, suggestion.length)
                    );

                    // 添加确认标记
                    item.command = {
                        command: 'editor.action.inlineSuggest.commit',
                        title: '确认补全'
                    };

                    return [item];
                } catch (error) {
                    if (axios.isAxiosError(error)) {
                        console.error('API请求错误详情:', error.response?.data);
                        vscode.window.showErrorMessage(`Ollama错误: ${error.response?.data?.error || '未知错误'}`);
                    } else {
                        console.error('非API错误:', error);
                        vscode.window.showErrorMessage('非预期的错误类型');
                    }
                    return [];
                }
            }
        }
    );
    context.subscriptions.push(provider, triggerCommand, tabHandler);
}

// 添加类型扩展
declare module 'vscode' {
    interface ExtensionContext {
        triggeredByF1?: boolean;
    }
}