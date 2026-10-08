"""Local-only adapter. Configure Python/pypdf, Tesseract and Poppler separately.

Usage: python extract-document-local.py <input> [--tesseract absolute-path]
       [--pdftoppm absolute-path] [--soffice absolute-path]
Never emits uploaded text on errors or uses a network service.
"""
import argparse
import os
from pathlib import Path
import subprocess
import sys
import tempfile

MAX_PAGES = 50
MAX_TEXT_BYTES = 2 * 1024 * 1024


def ocr_arguments(image, args):
    command = [str(image), "stdout", "-l", "rus"]
    if args.tessdata_dir:
        directory = Path(args.tessdata_dir)
        if not directory.is_absolute() or not (directory / "rus.traineddata").is_file():
            raise ValueError("RUSSIAN_OCR_DATA_REQUIRED")
        command.extend(["--tessdata-dir", str(directory)])
    return command


def execute(executable, args):
    if not executable or not Path(executable).is_absolute():
        raise ValueError("LOCAL_TOOL_REQUIRED")
    return subprocess.run([executable, *args], check=True, capture_output=True,
                          timeout=20, text=True, encoding="utf-8", errors="strict",
                          creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0)).stdout


def extract(args):
    source = Path(args.input).resolve(strict=True)
    if source.stat().st_size > 10 * 1024 * 1024:
        raise ValueError("FILE_LIMIT")
    extension = source.suffix.lower()
    if extension == ".pdf":
        from pypdf import PdfReader
        reader = PdfReader(source)
        if reader.is_encrypted or len(reader.pages) > MAX_PAGES:
            raise ValueError("PDF_LIMIT_OR_ENCRYPTED")
        pages = [(page.extract_text() or "") for page in reader.pages]
        if all(page.strip() for page in pages):
            return "\n".join(pages)
        # A mixed PDF must not silently omit its scanned pages.
        with tempfile.TemporaryDirectory(prefix="clover-pdf-ocr-") as directory:
            prefix = str(Path(directory) / "page")
            execute(args.pdftoppm, ["-png", "-r", "150", "-f", "1", "-l", str(MAX_PAGES), str(source), prefix])
            images = sorted(Path(directory).glob("page-*.png"))
            if len(images) != len(reader.pages):
                raise ValueError("OCR_PAGE_COUNT")
            return "\n".join(execute(args.tesseract, ocr_arguments(image, args)) for image in images)
    if extension in (".png", ".jpg", ".jpeg"):
        return execute(args.tesseract, ocr_arguments(source, args))
    if extension == ".doc":
        with tempfile.TemporaryDirectory(prefix="clover-doc-text-") as directory:
            profile = (Path(directory) / "profile").as_uri()
            execute(args.soffice, [f"-env:UserInstallation={profile}", "--headless", "--convert-to", "txt:Text (encoded):UTF8", "--outdir", directory, str(source)])
            return (Path(directory) / f"{source.stem}.txt").read_text(encoding="utf-8")
    raise ValueError("FORMAT_UNSUPPORTED")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("input")
    parser.add_argument("--tesseract", default=os.environ.get("CLOVER_TESSERACT"))
    parser.add_argument("--tessdata-dir", default=os.environ.get("CLOVER_TESSDATA_DIR"))
    parser.add_argument("--pdftoppm", default=os.environ.get("CLOVER_PDFTOPPM"))
    parser.add_argument("--soffice", default=os.environ.get("CLOVER_DOCUMENTS_CONVERTER"))
    try:
        result = extract(parser.parse_args())
        if not result.strip() or len(result.encode("utf-8")) > MAX_TEXT_BYTES:
            raise ValueError("TEXT_LIMIT_OR_EMPTY")
        sys.stdout.reconfigure(encoding="utf-8")
        sys.stdout.write(result)
    except Exception:
        sys.stderr.write("LOCAL_EXTRACTION_FAILED\n")
        sys.exit(1)
