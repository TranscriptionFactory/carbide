#!/usr/bin/env python3
"""Measure what a cosine similarity actually *means* in a real Carbide vault.

Carbide displays embedding cosines as percentages ("84%") and filters
suggestions and graph edges on a 0-1 threshold that defaults to 0.5. Both only
make sense if the cosine scale is anchored — if unrelated notes score near 0.
CLS-pooled retrieval models (arctic-embed, bge — four of the five in Carbide's
registry) are not obviously anchored that way: their background similarity can
sit well above 0, which would make "84%" unremarkable and the 0.5 default a
filter that admits everything.

This script answers that from your own embeddings. It reads the vector tables
read-only, samples the pairwise cosine distribution, and reports:

  * the background distribution   - what two *unrelated* notes score
  * the nearest-neighbour distribution - what Suggested Links actually shows
  * a threshold table             - how many notes each cutoff would admit
  * a badge calibration table     - what percentile a displayed % sits at

Stdlib only. Install numpy for an exact, fast run; without it the script falls
back to sampling and says so in the output.

Usage:
    python3 scripts/cosine_calibration.py
    python3 scripts/cosine_calibration.py --db ~/.carbide/caches/vaults/<id>.db
    python3 scripts/cosine_calibration.py --blocks
"""

from __future__ import annotations

import argparse
import glob
import math
import os
import random
import sqlite3
import sys
from array import array

try:
    import numpy as np

    HAVE_NUMPY = True
except ImportError:  # pragma: no cover - environment dependent
    np = None
    HAVE_NUMPY = False


DEFAULT_DB_GLOB = "~/.carbide/caches/vaults/*.db"

# Carbide's shipped defaults, so the report can speak to the live configuration
# rather than to abstract cutoffs.
CARBIDE_SEMANTIC_THRESHOLD = 0.5  # semantic_similarity_threshold (a similarity)
CARBIDE_AI_DISTANCE = 0.5  # ai_vault_context_similarity_threshold (a distance)

CANDIDATE_THRESHOLDS = [0.3, 0.4, 0.5, 0.6, 0.7, 0.75, 0.8, 0.85, 0.9, 0.95]
REPORT_PERCENTILES = [0.1, 1, 5, 25, 50, 75, 90, 95, 99, 99.9]

# The Settings slider (`settings_dialog.svelte`) offers only these positions, so
# a recommended cutoff outside them is one the user cannot actually select.
SLIDER_MIN, SLIDER_MAX, SLIDER_STEP = 0.10, 0.90, 0.05


def slider_can_reach(cutoff: float) -> bool:
    if cutoff < SLIDER_MIN - 1e-9 or cutoff > SLIDER_MAX + 1e-9:
        return False
    steps = (cutoff - SLIDER_MIN) / SLIDER_STEP
    return abs(steps - round(steps)) < 1e-6


def describe_slider(cutoff: float) -> str:
    if cutoff > SLIDER_MAX:
        return "above slider max"
    if cutoff < SLIDER_MIN:
        return "below slider min"
    nearest = SLIDER_MIN + round((cutoff - SLIDER_MIN) / SLIDER_STEP) * SLIDER_STEP
    return f"nearest {nearest:.2f}"


# --------------------------------------------------------------------------
# database
# --------------------------------------------------------------------------


def discover_databases(pattern: str) -> list[str]:
    return sorted(glob.glob(os.path.expanduser(pattern)))


def open_readonly(path: str) -> sqlite3.Connection:
    # A URI in read-only mode cannot create, migrate, or lock out the running
    # app; this script must never be able to damage a live vault cache.
    uri = f"file:{os.path.abspath(path)}?mode=ro"
    return sqlite3.connect(uri, uri=True)


def table_exists(conn: sqlite3.Connection, name: str) -> bool:
    row = conn.execute(
        "SELECT 1 FROM sqlite_master WHERE type='table' AND name=?", (name,)
    ).fetchone()
    return row is not None


def row_count(conn: sqlite3.Connection, table: str) -> int:
    if not table_exists(conn, table):
        return 0
    return int(conn.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0])


def read_meta(conn: sqlite3.Connection) -> dict[str, str]:
    if not table_exists(conn, "embedding_meta"):
        return {}
    return {
        str(key): str(value)
        for key, value in conn.execute("SELECT key, value FROM embedding_meta")
    }


def pick_database(paths: list[str]) -> str:
    """Choose the vault with the most note embeddings; the rest are listed."""
    scored = []
    for path in paths:
        try:
            with open_readonly(path) as conn:
                scored.append((row_count(conn, "note_embeddings"), path))
        except sqlite3.Error as err:
            print(f"  ! skipping {path}: {err}", file=sys.stderr)
    if not scored:
        sys.exit("No readable vault database found.")
    scored.sort(reverse=True)

    if len(scored) > 1:
        print("Multiple vault caches found:")
        for count, path in scored:
            print(f"  {count:>7} notes  {path}")
        print(f"\nUsing the largest. Pass --db to choose another.\n")
    return scored[0][1]


# --------------------------------------------------------------------------
# vectors
# --------------------------------------------------------------------------


def blob_to_floats(blob: bytes) -> array:
    vector = array("f")
    vector.frombytes(blob)
    if sys.byteorder == "big":
        # Carbide writes little-endian f32 (`floats_to_bytes`).
        vector.byteswap()
    return vector


def load_vectors(conn: sqlite3.Connection, table: str):
    """Returns (matrix, dims, stats). Matrix is numpy 2-D or a list of arrays."""
    if table == "note_embeddings":
        sql = "SELECT path, embedding FROM note_embeddings"
    else:
        sql = "SELECT path || '#' || heading_id, embedding FROM block_embeddings"

    raw: list[array] = []
    dims_seen: dict[int, int] = {}
    for _key, blob in conn.execute(sql):
        vector = blob_to_floats(blob)
        dims_seen[len(vector)] = dims_seen.get(len(vector), 0) + 1
        raw.append(vector)

    if not raw:
        sys.exit(f"{table} is empty — index the vault before calibrating.")

    dims = max(dims_seen, key=lambda d: dims_seen[d])
    mixed = sum(count for size, count in dims_seen.items() if size != dims)

    kept = []
    degenerate = 0
    non_finite = 0
    norms = []
    for vector in raw:
        if len(vector) != dims:
            continue
        total = 0.0
        finite = True
        for value in vector:
            if not math.isfinite(value):
                finite = False
                break
            total += value * value
        if not finite:
            non_finite += 1
            continue
        norm = math.sqrt(total)
        if norm <= 0.0:
            degenerate += 1
            continue
        norms.append(norm)
        kept.append(vector)

    if len(kept) < 2:
        sys.exit(f"{table} has fewer than two usable vectors.")

    stats = {
        "total_rows": len(raw),
        "usable": len(kept),
        "dims": dims,
        "mixed_dims": mixed,
        "degenerate": degenerate,
        "non_finite": non_finite,
        "norm_min": min(norms),
        "norm_max": max(norms),
    }

    if HAVE_NUMPY:
        matrix = np.array(kept, dtype=np.float32)
        # Carbide stores unit vectors, so `1 - dot` is cosine distance. Re-
        # normalizing here costs nothing and keeps the report honest if that
        # invariant is ever violated on disk.
        matrix /= np.linalg.norm(matrix, axis=1, keepdims=True)
        return matrix, dims, stats

    normalized = []
    for vector, norm in zip(kept, norms):
        normalized.append(array("f", [value / norm for value in vector]))
    return normalized, dims, stats


def dot(a: array, b: array) -> float:
    return sum(x * y for x, y in zip(a, b))


# --------------------------------------------------------------------------
# distributions
# --------------------------------------------------------------------------


def background_cosines(matrix, count: int, rng: random.Random) -> list[float]:
    """Cosine of randomly drawn note pairs — the 'unrelated' baseline."""
    n = matrix.shape[0] if HAVE_NUMPY else len(matrix)
    if HAVE_NUMPY:
        out = []
        remaining = count
        while remaining > 0:
            chunk = min(remaining, 50_000)
            left = np.random.randint(0, n, size=chunk)
            right = np.random.randint(0, n, size=chunk)
            keep = left != right
            if keep.any():
                out.append(
                    np.einsum("ij,ij->i", matrix[left[keep]], matrix[right[keep]])
                )
            remaining -= chunk
        return np.concatenate(out).tolist() if out else []

    values = []
    for _ in range(count):
        i = rng.randrange(n)
        j = rng.randrange(n)
        if i == j:
            continue
        values.append(dot(matrix[i], matrix[j]))
    return values


def neighbour_cosines(matrix, queries: int, top_k: int, rng: random.Random):
    """Best and k-th-best cosine per query — what a suggestion panel shows."""
    n = matrix.shape[0] if HAVE_NUMPY else len(matrix)
    queries = min(queries, n)
    picks = rng.sample(range(n), queries)

    best: list[float] = []
    kth: list[float] = []

    if HAVE_NUMPY:
        for start in range(0, queries, 64):
            block = picks[start : start + 64]
            sims = matrix[block] @ matrix.T
            for offset, query_index in enumerate(block):
                row = sims[offset]
                row[query_index] = -2.0  # never rank a note against itself
                k = min(top_k, n - 1)
                top = np.partition(row, -k)[-k:]
                top.sort()
                best.append(float(top[-1]))
                kth.append(float(top[0]))
        return best, kth

    for query_index in picks:
        query = matrix[query_index]
        scores = [
            dot(query, matrix[other]) for other in range(n) if other != query_index
        ]
        scores.sort(reverse=True)
        best.append(scores[0])
        kth.append(scores[min(top_k, len(scores)) - 1])
    return best, kth


def percentile(sorted_values: list[float], pct: float) -> float:
    if not sorted_values:
        return float("nan")
    rank = (pct / 100.0) * (len(sorted_values) - 1)
    low = int(math.floor(rank))
    high = min(low + 1, len(sorted_values) - 1)
    weight = rank - low
    return sorted_values[low] * (1 - weight) + sorted_values[high] * weight


def fraction_at_or_above(sorted_values: list[float], threshold: float) -> float:
    lo, hi = 0, len(sorted_values)
    while lo < hi:
        mid = (lo + hi) // 2
        if sorted_values[mid] < threshold:
            lo = mid + 1
        else:
            hi = mid
    return (len(sorted_values) - lo) / len(sorted_values)


def percentile_of(sorted_values: list[float], value: float) -> float:
    return 100.0 * (1.0 - fraction_at_or_above(sorted_values, value))


# --------------------------------------------------------------------------
# report
# --------------------------------------------------------------------------


def histogram(values: list[float], bins: int = 24, width: int = 46) -> str:
    lo, hi = min(values), max(values)
    if hi - lo < 1e-9:
        return f"  all values at {lo:.4f}\n"
    counts = [0] * bins
    scale = bins / (hi - lo)
    for value in values:
        index = min(bins - 1, int((value - lo) * scale))
        counts[index] += 1
    peak = max(counts) or 1

    lines = []
    for index, count in enumerate(counts):
        left = lo + (index / bins) * (hi - lo)
        right = lo + ((index + 1) / bins) * (hi - lo)
        bar = "#" * max(1 if count else 0, round(width * count / peak))
        share = 100.0 * count / len(values)
        lines.append(f"  {left:6.3f}..{right:6.3f} |{bar:<{width}} {share:5.1f}%")
    return "\n".join(lines) + "\n"


def section(title: str) -> None:
    print(f"\n{title}\n{'-' * len(title)}")


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Measure the real cosine similarity distribution in a Carbide vault."
    )
    parser.add_argument("--db", help="path to a vault .db (default: auto-discover)")
    parser.add_argument(
        "--glob",
        default=DEFAULT_DB_GLOB,
        help=f"search pattern (default: {DEFAULT_DB_GLOB})",
    )
    parser.add_argument(
        "--blocks",
        action="store_true",
        help="calibrate block_embeddings instead of note_embeddings",
    )
    parser.add_argument(
        "--pairs", type=int, default=0, help="random pairs to sample (0 = auto)"
    )
    parser.add_argument(
        "--queries",
        type=int,
        default=0,
        help="notes to run nearest-neighbour on (0 = auto)",
    )
    parser.add_argument(
        "--top-k", type=int, default=5, help="neighbours per query (default: 5)"
    )
    parser.add_argument("--seed", type=int, default=1, help="RNG seed (default: 1)")
    args = parser.parse_args()

    rng = random.Random(args.seed)
    if HAVE_NUMPY:
        np.random.seed(args.seed)

    db_path = args.db
    if db_path:
        db_path = os.path.expanduser(db_path)
        if not os.path.exists(db_path):
            sys.exit(f"No such database: {db_path}")
    else:
        found = discover_databases(args.glob)
        if not found:
            sys.exit(
                f"No vault cache matched {args.glob}\n"
                "Open a vault in Carbide and let it index, or pass --db."
            )
        db_path = pick_database(found)

    table = "block_embeddings" if args.blocks else "note_embeddings"

    with open_readonly(db_path) as conn:
        meta = read_meta(conn)
        matrix, dims, stats = load_vectors(conn, table)

    n = stats["usable"]
    pairs = args.pairs or (400_000 if HAVE_NUMPY else 60_000)
    queries = args.queries or (min(600, n) if HAVE_NUMPY else min(120, n))

    print("=" * 72)
    print("Carbide cosine calibration")
    print("=" * 72)
    print(f"database     {db_path}")
    print(f"table        {table}")
    print(f"model        {meta.get('model_version', '(not recorded)')}")
    print(f"dimensions   {dims}")
    print(f"vectors      {n} usable of {stats['total_rows']} rows")
    if stats["degenerate"] or stats["non_finite"] or stats["mixed_dims"]:
        print(
            f"  ! excluded  {stats['degenerate']} all-zero, "
            f"{stats['non_finite']} non-finite, {stats['mixed_dims']} wrong-dimension"
        )
        print(
            "    (these should be impossible — `is_usable_vector` gates every ingest)"
        )
    print(
        f"stored norms {stats['norm_min']:.6f} .. {stats['norm_max']:.6f} (expect ~1.0)"
    )
    print(
        f"mode         {'numpy (exact)' if HAVE_NUMPY else 'stdlib sampling — install numpy for exact results'}"
    )

    if not HAVE_NUMPY and n > 2000:
        print(
            "\n  ! Without numpy the nearest-neighbour pass scans every vector in pure\n"
            "    Python and will take minutes on this corpus. `pip3 install numpy`\n"
            "    turns it into seconds."
        )

    section(f"Background distribution ({pairs:,} random pairs)")
    background = sorted(background_cosines(matrix, pairs, rng))
    print("This is what two notes with no particular relationship score.")
    print("If the bulk sits far above 0, the cosine scale is not anchored and a")
    print("raw percentage badge cannot be read as 'how related these are'.\n")
    for pct in REPORT_PERCENTILES:
        print(f"  p{pct:<5} {percentile(background, pct):+.4f}")
    print(f"  mean   {sum(background) / len(background):+.4f}")
    print()
    print(histogram(background))

    section(f"Nearest-neighbour distribution ({queries} queries, top {args.top_k})")
    best, kth = neighbour_cosines(matrix, queries, args.top_k, rng)
    best.sort()
    kth.sort()
    print("What a suggestion panel actually displays: the best match per note,")
    print(
        f"and the {args.top_k}th best (the weakest row a limit-{args.top_k} panel shows).\n"
    )
    print(f"  {'':7} {'best':>9} {'#' + str(args.top_k):>9}")
    for pct in [5, 25, 50, 75, 95]:
        print(f"  p{pct:<6} {percentile(best, pct):+9.4f} {percentile(kth, pct):+9.4f}")
    print(f"  min     {best[0]:+9.4f} {kth[0]:+9.4f}")
    print(f"  max     {best[-1]:+9.4f} {kth[-1]:+9.4f}")

    section("Threshold table — what each cutoff admits")
    print("`admits` is the share of all note pairs at or above the cutoff;")
    print(f"`per note` extrapolates that across the {n - 1} other notes in the vault.")
    print("A cutoff that admits hundreds of notes per query is not filtering.\n")
    print(f"  {'cutoff':>7} {'admits':>9} {'per note':>10}")
    for threshold in CANDIDATE_THRESHOLDS:
        share = fraction_at_or_above(background, threshold)
        marker = (
            "  <- Carbide default" if threshold == CARBIDE_SEMANTIC_THRESHOLD else ""
        )
        print(
            f"  {threshold:>7.2f} {share * 100:>8.2f}% {share * (n - 1):>10.1f}{marker}"
        )

    section("Badge calibration — what a displayed percentage means")
    print("Percentile of the background distribution for each badge value.")
    print("A badge at the 50th percentile describes a completely ordinary pair.\n")
    print(f"  {'badge':>7} {'percentile':>12}")
    for badge in [0.5, 0.6, 0.7, 0.75, 0.8, 0.85, 0.9, 0.95]:
        print(f"  {badge * 100:>6.0f}% {percentile_of(background, badge):>11.2f}")

    section("Verdict")
    median = percentile(background, 50)
    default_share = fraction_at_or_above(background, CARBIDE_SEMANTIC_THRESHOLD)
    default_per_note = default_share * (n - 1)

    if median > 0.35:
        print(
            f"* The background median is {median:+.3f}. The cosine scale is NOT anchored\n"
            f"  near zero: an ordinary unrelated pair already reads as "
            f"'{median * 100:.0f}%' in the UI."
        )
    else:
        print(
            f"* The background median is {median:+.3f}, close enough to zero that a raw\n"
            "  percentage badge is defensible as-is."
        )

    if default_per_note > 25:
        print(
            f"* The 0.5 default admits {default_share * 100:.1f}% of pairs "
            f"(~{default_per_note:.0f} notes per query).\n"
            "  It is not a meaningful filter on this vault — the per-panel limit is\n"
            "  what actually bounds the results."
        )
    else:
        print(
            f"* The 0.5 default admits ~{default_per_note:.1f} notes per query, which is a\n"
            "  real filter on this vault."
        )

    print()
    print("  To admit roughly N notes per query, the cutoff must be:")
    print(f"  {'notes/query':>12} {'cutoff':>8} {'slider':>18}")
    for target in (50, 20, 10, 5, 2, 1):
        if target >= n - 1:
            continue
        # Invert through the percentile function rather than scanning a grid:
        # when the distribution is narrow, a 0.01 grid cannot resolve the
        # difference between admitting 20 notes and admitting 5.
        cutoff = percentile(background, 100.0 * (1.0 - target / (n - 1)))
        print(f"  {target:>12} {cutoff:>8.4f} {describe_slider(cutoff):>18}")

    # Whether the slider can express the right cutoff is the question that
    # decides if this is a calibration problem or a control problem, so measure
    # the consequence of snapping rather than just reporting non-reachability.
    target = 10
    needed = percentile(background, 100.0 * (1.0 - target / (n - 1)))
    snapped = min(
        max(SLIDER_MIN, round((needed - SLIDER_MIN) / SLIDER_STEP) * SLIDER_STEP + SLIDER_MIN),
        SLIDER_MAX,
    )
    snapped_per_note = fraction_at_or_above(background, snapped) * (n - 1)
    print(
        f"\n* Aiming for ~{target} suggestions per note needs a cutoff of ~{needed:.3f}.\n"
        f"  The nearest position the Settings slider can reach is {snapped:.2f}, which admits\n"
        f"  ~{snapped_per_note:.1f} notes per query."
    )
    off_by = (
        float("inf")
        if snapped_per_note < 0.5
        else max(snapped_per_note / target, target / snapped_per_note)
    )
    if needed > SLIDER_MAX or needed < SLIDER_MIN:
        print(
            f"  The cutoff this vault needs falls outside the slider's "
            f"{SLIDER_MIN:.2f}-{SLIDER_MAX:.2f} range\n  entirely — the control cannot express it."
        )
    elif off_by == float("inf"):
        print(
            f"  That admits essentially nothing. The {SLIDER_STEP:.2f} step is too coarse for\n"
            "  this corpus: adjacent slider positions straddle the useful range, so no\n"
            "  reachable setting gives a usable number of suggestions."
        )
    elif off_by > 3:
        print(
            f"  That is off by ~{off_by:.0f}x. The {SLIDER_STEP:.2f} step is too coarse for this\n"
            "  corpus: adjacent slider positions straddle the useful range."
        )

    print(
        "\n* Carbide's AI context setting is a DISTANCE "
        f"(default {CARBIDE_AI_DISTANCE}), i.e. it keeps\n"
        f"  pairs at or above {1 - CARBIDE_AI_DISTANCE:.2f} cosine — read it off the same table."
    )
    print()


if __name__ == "__main__":
    main()
