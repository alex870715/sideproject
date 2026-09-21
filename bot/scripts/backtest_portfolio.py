"""Run public-data replay and optionally export a credential-free portfolio snapshot."""
import argparse
import json
import sys
import uuid
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from core.autopilot_backtest import ReplayConfig, run_backtest
from core.storage import DATA_DIR


def public_snapshot(runs):
    """Allowlist only simulation output; never serialize the live account or state file."""
    metrics = ('return_pct', 'final_equity', 'max_drawdown_pct', 'total_trades', 'win_rate', 'profit_factor', 'fees', 'funding', 'halted')
    exported = []
    for run in runs:
        curve = run['result']['curve']
        exported.append(dict(
            config={k:run['config'][k] for k in ('budget','leverage','style','horizon','days','allow_short')},
            version=run['version'], generated_at=run['generated_at'], data_sha256=run['data_sha256'],
            result={k:run['result'][k] for k in metrics}, holdout={k:run['holdout'][k] for k in metrics},
            curve=curve, warnings=run['warnings']))
    return dict(source='OKX public historical candles and funding rates', kind='historical_simulation', runs=exported)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--budget', type=float, default=1000)
    parser.add_argument('--leverage', type=int, default=10)
    parser.add_argument('--style', choices=['careful','balanced','active'], default='active')
    parser.add_argument('--export', type=Path)
    args = parser.parse_args()
    directory = DATA_DIR/'autopilot'/'backtests'
    directory.mkdir(parents=True, exist_ok=True)
    runs = []
    for horizon, days in [('short',7),('medium',30),('long',90)]:
        result = run_backtest(ReplayConfig(budget=args.budget, leverage=args.leverage, style=args.style, horizon=horizon, days=days), print)
        key = uuid.uuid4().hex
        (directory/(key+'.json')).write_text(json.dumps(result, ensure_ascii=False, allow_nan=False))
        runs.append(result)
        print(horizon, 'return %:', round(result['result']['return_pct'], 2), 'holdout %:', round(result['holdout']['return_pct'], 2))
    if args.export:
        args.export.parent.mkdir(parents=True, exist_ok=True)
        args.export.write_text(json.dumps(public_snapshot(runs), ensure_ascii=False, allow_nan=False, separators=(',',':')))


if __name__ == '__main__':
    main()
