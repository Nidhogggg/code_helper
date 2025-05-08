import * as vscode from 'vscode';
import axios from 'axios';

export function activate(context: vscode.ExtensionContext) {

    const outputChannel = vscode.window.createOutputChannel('Ollama Code Completion');
    context.subscriptions.push(outputChannel); // 注册到上下文

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

    const provider = vscode.languages.registerInlineCompletionItemProvider(
        ['python', 'javascript'],
        {
            async provideInlineCompletionItems(document: vscode.TextDocument, position: vscode.Position) {
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
                        model: 'codellama:7b-instruct-q4_K_M',  // 根据你部署的模型调整
                        prompt: fullPrompt,
                        max_tokens: 50,
                        temperature: 0.3,
						stream: false
                    });
					// 添加调试输出
                    console.log('Prompt:', fullPrompt);
					console.log('Full API Response:', response.data);

                    const suggestion = response.data.response.trim();
                    const item = new vscode.InlineCompletionItem(
                        new vscode.SnippetString(suggestion)
                    );

                    // 添加样式控制（需要主题支持）
                    item.range = new vscode.Range(
                        position,
                        position.translate(0, suggestion.length)
                    );

                    // 添加确认标记（会在右侧显示 "↩ to apply"）
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

    const tabHandler = vscode.commands.registerCommand('extension.acceptGhostText', () => {
        vscode.commands.executeCommand('editor.action.inlineSuggest.commit');
    });

    // 绑定 Tab 键到确认命令
    context.subscriptions.push(
        vscode.workspace.onDidChangeTextDocument(e => {
            if (e.contentChanges.some(change => change.text === '\t')) {
                vscode.commands.executeCommand('extension.acceptGhostText');
            }
        })
    );

    // +++ 新增实时预览更新逻辑 +++
    let updateTimeout: NodeJS.Timeout;
    let lastDocVersion: number | null = null;  // 新增文档版本追踪
    let isRequesting = false;                  // 新增请求状态锁

    // 防抖函数（1000ms）
    const triggerUpdate = (editor: vscode.TextEditor | undefined) => {
        if (!editor || !editor.document.getText()) {
            return;
        }
        clearTimeout(updateTimeout);

        // 空文档或无效编辑器时直接返回
       if (!editor || !editor.document.getText()) {
            lastDocVersion = null;
            return;
        }

        // 记录当前文档版本
        const currentVersion = editor.document.version;
        lastDocVersion = currentVersion;

        updateTimeout = setTimeout(async () => {
            // 双重校验：版本一致且未在请求中
            if (!editor ||
                editor.document.version !== currentVersion ||
                isRequesting) {
                return;
            }

            isRequesting = true;
            try {
                await vscode.commands.executeCommand(
                    'editor.action.inlineSuggest.trigger'
                );
            } finally {
                isRequesting = false;
            }
        }, 1000);
    };

    // 注册文档变更监听
    const docChangeListener = vscode.workspace.onDidChangeTextDocument(e => {
        const editor = vscode.window.activeTextEditor;
        if (editor && e.document === editor.document) {
            triggerUpdate(editor);
        }
    });

    // 注册光标移动监听
    const cursorChangeListener = vscode.window.onDidChangeTextEditorSelection(e => {
        triggerUpdate(e.textEditor);
    });

    // 清理资源
    context.subscriptions.push(
        docChangeListener,
        cursorChangeListener
    );

    context.subscriptions.push(provider, tabHandler, docChangeListener, cursorChangeListener);
}