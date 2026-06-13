import json
from datetime import datetime, timezone
from pathlib import Path

from .html_processing import images_to_base64, inject_image_dimensions
from .models import get_or_create_models


def log(message: str):
    print(
        json.dumps(
            {
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "service": "academic-reader-worker",
                "worker": "marker",
                "eventName": "worker_lifecycle",
                "message": message,
            }
        ),
        flush=True,
    )


def convert_file(
    file_path: Path,
    use_llm: bool,
    force_ocr: bool,
    page_range: str | None,
    artifact_dict: dict | None = None,
) -> dict:
    all_formats = _build_and_render_all(
        file_path,
        use_llm,
        force_ocr,
        page_range,
        artifact_dict,
    )
    html_content, images = _process_html(all_formats["html"], all_formats["images"])

    return {
        "content": html_content,
        "metadata": all_formats["metadata"],
        "formats": {
            "html": html_content,
            "markdown": all_formats["markdown"],
            "chunks": all_formats["chunks"],
        },
        "images": images_to_base64(images) if images else None,
    }


def _create_converter(
    use_llm: bool,
    force_ocr: bool,
    page_range: str | None,
    artifact_dict: dict | None = None,
):
    import os

    from marker.config.parser import ConfigParser
    from marker.converters.pdf import PdfConverter

    from .config import BATCH_SIZE_OVERRIDES

    config_dict = {
        "output_format": "html",
        "use_llm": use_llm,
        "force_ocr": force_ocr,
        **BATCH_SIZE_OVERRIDES,
    }
    if use_llm and os.getenv("GOOGLE_API_KEY"):
        config_dict["gemini_api_key"] = os.getenv("GOOGLE_API_KEY")
    if page_range:
        config_dict["page_range"] = page_range

    config_parser = ConfigParser(config_dict)
    return PdfConverter(
        config=config_parser.generate_config_dict(),
        artifact_dict=artifact_dict or get_or_create_models(),
        processor_list=config_parser.get_processors(),
        renderer=config_parser.get_renderer(),
    )


def _render_all_formats(document) -> dict:
    from marker.renderers.chunk import ChunkRenderer
    from marker.renderers.html import HTMLRenderer
    from marker.renderers.markdown import MarkdownRenderer

    html_output = HTMLRenderer({"add_block_ids": True})(document)
    markdown_output = MarkdownRenderer()(document)
    chunk_output = ChunkRenderer()(document)
    chunks = chunk_output.model_dump(mode="json") if chunk_output else None

    return {
        "html": html_output.html,
        "markdown": markdown_output.markdown,
        "chunks": chunks,
        "images": html_output.images,
        "metadata": html_output.metadata,
    }


def _process_html(html: str, images: dict) -> tuple[str, dict | None]:
    if images:
        html = inject_image_dimensions(html, images)
        return html, images
    return html, None


def _build_and_render_all(
    file_path: Path,
    use_llm: bool,
    force_ocr: bool,
    page_range: str | None,
    artifact_dict: dict | None = None,
) -> dict:
    converter = _create_converter(use_llm, force_ocr, page_range, artifact_dict)
    document = converter.build_document(str(file_path))
    all_formats = _render_all_formats(document)

    chunks = all_formats.get("chunks") or {}
    if chunks.get("blocks"):
        log(f"Got {len(chunks['blocks'])} Marker chunks")

    return all_formats
