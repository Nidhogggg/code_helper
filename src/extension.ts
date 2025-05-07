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

    const provider = vscode.languages.registerCompletionItemProvider(
        ['python', 'javascript'],
        {
            async provideCompletionItems(document: vscode.TextDocument, position: vscode.Position) {
                // 获取当前代码上下文
                const textBeforeCursor = document.getText(
                    new vscode.Range(
                        new vscode.Position(Math.max(0, position.line - 5), 0),
                        position
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
                    const completion = new vscode.CompletionItem(
                        response.data.response.trim(),
                        vscode.CompletionItemKind.Snippet
                    );

                    return [completion];
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
        },
		'.'  // 触发补全的字符
    );

    context.subscriptions.push(provider);
}