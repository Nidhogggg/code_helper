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

                try {
                    // 调用本地Ollama API
                    const response = await axios.post('http://localhost:11434/api/generate', {
                        model: 'codellama:7b-instruct-q4_K_M',  // 根据你部署的模型调整
                        prompt: textBeforeCursor,
                        max_tokens: 50,
                        temperature: 0.3,
						stream: false
                    });
					// 添加调试输出
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

    context.subscriptions.push(provider, tabHandler);
}