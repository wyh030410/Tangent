import os
from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
from anthropic import Anthropic
from tavily import TavilyClient
from dotenv import load_dotenv

load_dotenv()

app = Flask(__name__, static_folder='static')
CORS(app)

anthropic = Anthropic(api_key=os.getenv('ANTHROPIC_API_KEY'))
tavily = TavilyClient(api_key=os.getenv('TAVILY_API_KEY'))

@app.route('/')
def index():
    return send_from_directory('static', 'index.html')

@app.route('/<path:path>')
def static_files(path):
    return send_from_directory('static', path)

@app.route('/api/chat', methods=['POST'])
def chat():
    """Main chat interface"""
    try:
        data = request.json
        messages = data.get('messages', [])

        def generate():
            with anthropic.messages.stream(
                model="claude-sonnet-4-5",
                max_tokens=4096,
                messages=messages
            ) as stream:
                for text in stream.text_stream:
                    yield f"data: {text}\n\n"

        return app.response_class(generate(), mimetype='text/event-stream')
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@app.route('/api/search', methods=['POST'])
def search():
    """Web search interface"""
    try:
        data = request.json
        query = data.get('query', '')

        results = tavily.search(query=query, max_results=5)

        # Format search results
        context = "\n\n".join([
            f"Source: {r['url']}\n{r['content']}"
            for r in results.get('results', [])
        ])

        return jsonify({
            'success': True,
            'context': context
        })
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

if __name__ == '__main__':
    app.run(debug=True, port=5000)
