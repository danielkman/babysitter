from __future__ import annotations
import json as json_mod
from typing import Any
from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse, StreamingResponse
from amux_proxy.auth import verify_auth
from amux_proxy.config import ProxyConfig
from amux_proxy.errors import format_openai_error


def create_router(config: ProxyConfig, completion_fn=None) -> APIRouter:
    router = APIRouter()

    @router.post("/v1/responses", response_model=None)
    async def responses(request: Request) -> JSONResponse | StreamingResponse:
        verify_auth(request, config.auth_token)
        body = await request.json()
        import litellm

        litellm.drop_params = config.drop_unsupported_params
        is_streaming = body.get("stream", False)
        _complete = completion_fn or litellm.acompletion
        try:
            inp = body.get("input", "")
            messages = [{"role": "user", "content": inp}] if isinstance(inp, str) else inp
            instructions = body.get("instructions")
            if instructions:
                messages.insert(0, {"role": "system", "content": instructions})
            response: Any = await _complete(
                model=config.target_model,
                messages=messages,
                max_tokens=body.get("max_output_tokens"),
                stream=is_streaming,
                timeout=config.timeout,
                num_retries=config.max_retries,
            )
            if not is_streaming:
                choice = response.choices[0]
                return JSONResponse(
                    {
                        "id": response.id,
                        "object": "response",
                        "status": "completed",
                        "output": [
                            {
                                "type": "message",
                                "role": "assistant",
                                "content": [{"type": "output_text", "text": choice.message.content}],
                            }
                        ],
                        "usage": {
                            "input_tokens": response.usage.prompt_tokens,
                            "output_tokens": response.usage.completion_tokens,
                        },
                    }
                )

            async def generate():  # type: ignore[return]
                resp_id = f"resp_{id(response)}"
                yield f"event: response.created\ndata: {json_mod.dumps({'type': 'response.created', 'response': {'id': resp_id, 'status': 'in_progress'}})}\n\n"
                yield f"event: response.output_item.added\ndata: {json_mod.dumps({'type': 'response.output_item.added', 'output_index': 0, 'item': {'type': 'message', 'role': 'assistant'}})}\n\n"
                yield f"event: response.content_part.added\ndata: {json_mod.dumps({'type': 'response.content_part.added', 'output_index': 0, 'content_index': 0, 'part': {'type': 'output_text', 'text': ''}})}\n\n"
                async for chunk in response:
                    delta = chunk.choices[0].delta.content
                    if delta:
                        yield f"event: response.output_text.delta\ndata: {json_mod.dumps({'type': 'response.output_text.delta', 'output_index': 0, 'content_index': 0, 'delta': delta})}\n\n"
                yield f"event: response.output_text.done\ndata: {json_mod.dumps({'type': 'response.output_text.done', 'output_index': 0, 'content_index': 0})}\n\n"
                yield f"event: response.completed\ndata: {json_mod.dumps({'type': 'response.completed', 'response': {'id': resp_id, 'status': 'completed'}})}\n\n"

            return StreamingResponse(generate(), media_type="text/event-stream")
        except Exception as e:
            return format_openai_error(e)

    return router
