"""Train NETSCOPE's experimental optional model from labeled JSONL lab runs."""
import argparse
import json
from pathlib import Path
import sys
import os

PROJECT_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PROJECT_ROOT))

from app.diagnosis.optional_model import train_model


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("runs", type=Path, help="JSONL from tools/label_run.py; held-out rows are ignored")
    parser.add_argument("output", type=Path, help="Destination model JSON (keep outside public/static directories)")
    parser.add_argument("--minimum-examples-per-class", type=int, default=3)
    args = parser.parse_args()
    if not args.runs.is_file() or args.minimum_examples_per_class < 2:
        parser.error("provide an existing JSONL file and a minimum of at least two examples per class")
    output = args.output.expanduser().resolve()
    if output == PROJECT_ROOT or PROJECT_ROOT in output.parents:
        parser.error("write model artifacts outside the repository so they are not published accidentally")
    records = [json.loads(line) for line in args.runs.read_text(encoding="utf-8").splitlines() if line.strip()]
    try:
        model = train_model(records, args.minimum_examples_per_class)
    except ValueError as error:
        parser.error(str(error))
    output.parent.mkdir(parents=True, exist_ok=True)
    descriptor = os.open(output, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(descriptor, "w", encoding="utf-8") as stream:
        stream.write(json.dumps(model, separators=(",", ":")) + "\n")
    output.chmod(0o600)
    print(f"Wrote experimental {model['algorithm']} model using {model['training_runs']} non-held-out runs.")
    print("Relative scores are not calibrated probabilities. Keep held-out runs separate for evaluation.")


if __name__ == "__main__":
    main()
