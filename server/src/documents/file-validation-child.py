"""Bounded local structural validation. No text extraction or signature claims."""
import io
import sys
import warnings
import zlib
import base64
import re

MAX_DECODED = 16 * 1024 * 1024

def decode_stream(stream, remaining):
    raw = stream._data
    if not isinstance(raw, bytes) or len(raw) > MAX_BYTES:
        raise ValueError()
    filters = stream.get("/Filter", [])
    if isinstance(filters, str):
        filters = [filters]
    if len(filters) > 4 or stream.get("/DecodeParms"):
        raise ValueError()
    for filter_name in filters:
        if filter_name in ("/FlateDecode", "/Fl"):
            decoder = zlib.decompressobj()
            decoded = decoder.decompress(raw, remaining + 1)
            if len(decoded) > remaining or not decoder.eof or decoder.unconsumed_tail:
                raise ValueError()
            raw = decoded
        elif filter_name in ("/ASCII85Decode", "/A85"):
            source = re.sub(rb"\s+", b"", raw)
            if source.startswith(b"<~"):
                source = source[2:]
            if source.endswith(b"~>"):
                source = source[:-2]
            raw = base64.a85decode(source)
        elif filter_name in ("/ASCIIHexDecode", "/AHx"):
            source = re.sub(rb"\s+", b"", raw).rstrip(b">")
            if len(source) % 2:
                source += b"0"
            raw = bytes.fromhex(source.decode("ascii"))
        else:
            # Unsupported compression must never be called readable without validation.
            raise ValueError()
        if len(raw) > remaining:
            raise ValueError()
    if len(raw) > remaining:
        raise ValueError()
    return len(raw)

MAX_BYTES = 10 * 1024 * 1024
data = sys.stdin.buffer.read(MAX_BYTES + 1)
try:
    if not data or len(data) > MAX_BYTES:
        raise ValueError()
    if sys.argv[1] == "pdf":
        from pypdf import PdfReader
        import pypdf.filters
        # Also constrain incidental xref/object-stream decoding by the parser.
        pypdf.filters.ZLIB_MAX_OUTPUT_LENGTH = MAX_DECODED
        reader = PdfReader(io.BytesIO(data), strict=True)
        if reader.is_encrypted or not 0 < len(reader.pages) <= 200:
            raise ValueError()
        decoded_bytes = 0
        for page in reader.pages:
            width, height = float(page.mediabox.width), float(page.mediabox.height)
            if not 0 < width <= 14400 or not 0 < height <= 14400:
                raise ValueError()
            # Decode page content with a shared output budget, without pypdf's
            # permissive recovery of malformed compressed streams.
            contents = page.get("/Contents")
            if contents is not None:
                contents = contents.get_object()
                streams = list(contents) if isinstance(contents, list) else [contents]
                if len(streams) > 1000:
                    raise ValueError()
                for stream in streams:
                    stream = stream.get_object()
                    if not hasattr(stream, "get_data"):
                        raise ValueError()
                    decoded_bytes += decode_stream(stream, MAX_DECODED - decoded_bytes)
    else:
        from PIL import Image
        Image.MAX_IMAGE_PIXELS = 25_000_000
        warnings.simplefilter("error", Image.DecompressionBombWarning)
        image = Image.open(io.BytesIO(data))
        expected = "PNG" if sys.argv[1] == "png" else "JPEG"
        if image.format != expected or image.width * image.height > Image.MAX_IMAGE_PIXELS:
            raise ValueError()
        image.verify()
        image = Image.open(io.BytesIO(data))
        image.load()
    print("OK")
except ImportError:
    print("UNAVAILABLE")
    sys.exit(2)
except Exception:
    print("INVALID")
    sys.exit(1)
