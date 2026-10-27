# Muse Code and Meta Model Smoke Test Results

Test window: 2026-10-26 20:34:26–20:35:19 UTC  
Environment: Ubuntu 24.04.4 LTS, x86_64, Python 3.14.7  
Base API URL: `https://api.meta.ai/v1`

## Final status

| Target | Exact model/version | Endpoint | UTC start | HTTP / exit | Result | Latency | Returned usage |
|---|---|---|---|---|---|---|---|
| Muse Code | Muse Code 1.4.13 (1.4.13-R6996.1); CLI default documented as `muse-spark-1.2` | `muse exec` through the Meta provider | 2026-10-26T20:34:26Z | exit 0; HTTP not exposed | **PASS** | 4102 ms | Not returned |
| Model catalog | `GET /v1/models` | `https://api.meta.ai/v1/models` | 2026-10-26T20:34:36Z | 200 | **PASS** | 354 ms | None |
| Muse Spark | `muse-spark-1.3` | `https://api.meta.ai/v1/chat/completions` | 2026-10-26T20:35:02Z | 200; `finish_reason: stop` | **FAIL** | 4184 ms | 28 prompt + 394 completion = 422 total; 146 reasoning |
| Muse Wonder | `muse-wonder-1.0` | `https://api.meta.ai/v1/chat/completions` | 2026-10-26T20:35:19Z | 200; `finish_reason: stop` | **FAIL** | 2966 ms | 165 prompt + 265 completion = 430 total; 169 reasoning |
| Muse Voice Transcribe | `muse-voice-transcribe-1.0` | `https://api.meta.ai/v1/asr/transcribe` | 2026-10-26T20:34:44Z | 200 | **PASS** (semantic) | 966 ms | Not returned; 2720 ms audio processed |

No target was BLOCKED. All three requested model IDs were visible and usable with the supplied key.

## Muse Code

- Installer: `https://dev.meta.ai/install.sh`
- Installer SHA-256: `5196d820127a241211c96cf38f0b2e30cff8506a82e9da9508cd5f826632a0ca`
- Installed launcher: `/home/azureuser/.local/bin/muse`
- Version: `Muse Code 1.4.13 (1.4.13-R6996.1)`
- Command used: `muse exec --max-model-steps 1 --disable-reminders --disable-web-tools --no-foreign-personal-context --no-session-log "Reply with exactly MUSE_OK and nothing else. Do not call any tools."`
- Sandbox and approval: CLI defaults, not disabled.
- Workspace: `/home/azureuser/muse-model-smoke/workspace`, reported as untrusted.
- Result: exit 0, 4102 ms, stdout `MUSE_OK`.

Stderr:

```text
muse: local session messaging disabled: session logging is required
muse: workspace root: /home/azureuser/muse-model-smoke/workspace (cwd default)
muse: Agent delegation: auto unavailable: workspace is untrusted.
```

Limitations:

- The CLI did not echo the resolved model or return token usage. The documented default is `muse-spark-1.2`; no `--model` override was used.
- `bwrap` is absent on this host. The text-only request completed without tools. Sandboxed shell-tool execution was not tested.
- No session log was written, so there is no server-side session record from this run.
- The request was intentionally tiny and does not test coding ability.

## Model catalog and contracts

`GET /v1/models` returned 200 in 354 ms. All expected targets were present:

- `muse-spark-1.3`
- `muse-wonder-1.0`
- `muse-voice-transcribe-1.0`

The response listed nine models in total:

```text
muse-image-1.0
muse-spark-1.1
muse-spark-1.2
muse-spark-1.2-contributor
muse-spark-1.3
muse-spark-1.3-contributor
muse-voice-transcribe-1.0
muse-wonder-1.0
sam-3.1
```

Every entry returned `created=0`. That value is recorded as returned; it was not interpreted as a timestamp.

No inference was performed by this check. It confirms catalog visibility and key access only.

## Muse Spark

- Model: `muse-spark-1.3`
- Endpoint: `POST https://api.meta.ai/v1/chat/completions`
- Parameters: `max_completion_tokens: 1000`, `reasoning_effort: "minimal"`
- HTTP status: 200
- `finish_reason`: `stop`
- Latency: 4184 ms
- Attempts: 1
- Usage: 28 prompt tokens, 394 completion tokens, 422 total; 146 reasoning tokens; 0 cached prompt tokens.

Prompt:

```text
Customer wants car service Saturday before 10 AM, with pickup. List known constraints and missing information.
```

Sanitized output:

```text
Here’s what we know so far, and what we still need:

**Known Constraints:**
1.  **Day:** Saturday
2.  **Time:** Before 10 AM - *needs pickup to arrive / service to start by then*
3.  **Pickup Required:** Yes - customer needs to be picked up, not self-driving in

**Missing Information Needed to Book:**

1.  **Which Saturday?** - This coming Saturday, or a specific date?
2.  **Pickup Details:**
   * Exact pickup time desired
   * Pickup address
3.  **Service / Destination Details:**
   * What type of car service? (airport transfer, hourly, point-to-point?)
   * Drop-off address / destination
   * Is a return trip needed?
4.  **Ride Details:**
   * Number of passengers
   * Luggage amount / special needs (child seat, wheelchair, etc.)
   * Vehicle preference (sedan, SUV, van, luxury?)
5.  **Contact & Payment:**
   * Name + phone number for the driver
   * Payment method

Want me to draft a quick follow-up message to ask the customer for these?
```

Validation:

| Check | Result |
|---|---|
| Lists known constraints | true |
| No invented clock slot | true |
| Recognizes time-reference ambiguity | false |
| Requests missing information | true |

Result: **FAIL**.

Reason: the output correctly avoids inventing a time and asks for missing booking details, but it does not explicitly flag the ambiguity in “before 10 AM.” It assumes the cutoff applies to both pickup arrival and service start. That assumption is the exact ambiguity the test was designed to catch.

The first attempt is retained as harness evidence, not as the final behavioral result:

- UTC start: 2026-10-26T20:34:36Z
- Parameters: `max_completion_tokens: 400`, `reasoning_effort: "low"`
- HTTP 200, `finish_reason: length`, 2870 ms
- Usage: 28 prompt + 400 completion = 428 total; 386 reasoning
- Visible output: `Here’s what we have so`
- Cause: the 400-token cap was consumed by reasoning. The test was rerun once with a 1000-token cap and minimal reasoning.

## Muse Wonder

- Model: `muse-wonder-1.0`
- Endpoint: `POST https://api.meta.ai/v1/chat/completions`
- Parameters: `max_completion_tokens: 1600`, `reasoning_effort: "minimal"`
- HTTP status: 200
- `finish_reason`: `stop`
- Latency: 2966 ms
- Attempts: 1
- Usage: 165 prompt tokens, 265 completion tokens, 430 total; 169 reasoning tokens; 0 cached prompt tokens.

Conversation used:

```text
System: Reference time: Monday, 2026-10-26, 09:00 in America/Los_Angeles. Use only this reference. Do not include hidden chain-of-thought.
User: Please book my car service for Tuesday at 9 AM, with pickup.
Assistant: Noted: Tuesday at 9 AM, with pickup.
User: Change the service to Wednesday at 11 AM. Keep pickup.
Assistant: Updated: Wednesday at 11 AM, with pickup.
User: Actually, keep Wednesday but move it to the morning. Pickup should be 8:30 AM. List active constraints, superseded constraints, and required clarification. Be concise. Do not include hidden chain-of-thought.
```

Sanitized output:

```text
**Active constraints**
- Car service
- Day: Wednesday
- Pickup: 8:30 AM

**Superseded constraints**
- Day: Tuesday
- Time: Tuesday 9:00 AM
- Time: Wednesday 11:00 AM

**Required clarification**
- Is 8:30 AM the service start time, or only the pickup time? If only pickup, what time is the service scheduled for?
```

Validation:

| Check | Result |
|---|---|
| Active Wednesday resolves to 2026-10-28 | false |
| Active pickup is 8:30 AM | true |
| Flags 11 AM versus “morning” conflict | false |
| Marks Tuesday 9 AM as superseded | true |

Result: **FAIL**.

Reason: the output keeps Wednesday and 8:30 AM pickup, and it correctly supersedes Tuesday. However, it silently treats Wednesday 11 AM as superseded, omits the explicit active date `2026-10-28`, and asks whether 8:30 is service start or pickup. That question is useful, but it does not resolve the required conflict between the earlier 11 AM service time and the later “morning” instruction.

The first attempt is retained as harness evidence, not as the final behavioral result:

- UTC start: 2026-10-26T20:34:39Z
- Parameters: `max_completion_tokens: 600`, `reasoning_effort: "low"`
- HTTP 200, `finish_reason: length`, 4602 ms
- Usage: 165 prompt + 600 completion = 765 total; 597 reasoning
- Visible output: empty
- Cause: the 600-token cap was consumed by reasoning. The test was rerun once with a 1600-token cap and minimal reasoning.

## Muse Voice Transcribe

- Model: `muse-voice-transcribe-1.0`
- Endpoint: `POST https://api.meta.ai/v1/asr/transcribe?sessionId=smoke-voice-c88c101426454b16a87e1498a9108308`
- Request format: multipart form with `request` JSON and `audio` WAV file
- Request parameters: `audioEncoding: "WAV"`, `mode: "PUSH_TO_TALK"`, `model: "muse-voice-transcribe-1.0"`
- HTTP status: 200
- Latency: 966 ms
- Attempts: 1
- Audio duration: 2720 ms
- Usage: not returned by the transcription endpoint

Fixture:

- Generated locally with `ffmpeg` and the `flite` TTS filter
- Format: WAV, 24 kHz, mono, `pcm_s16le`
- Duration: 2.70 s
- Size: 129,606 bytes
- Loudness: mean -20.7 dB, max -3.2 dB

Known text:

```text
The pickup is at eight thirty on Wednesday.
```

Transcript:

```text
The pickup is is at 8.30 on Wednesday..
```

Result: **PASS** on semantic content.

The transcript contains every key term. It is not verbatim: it duplicates “is,” renders “eight thirty” as “8.30,” and duplicates the final punctuation. If the requirement is exact transcription, treat this as a failure; for semantic booking extraction, it passes.

Limitations:

- No token usage is returned. Billing uses processed audio duration.
- The endpoint did not echo a resolved model name.
- The input is synthetic local TTS audio, not a real caller recording.
- Only one short clip and one voice were tested.
- No word timestamps or confidence scores were returned.

## Credentials and safety

- Key source: `/home/azureuser/.hermes/.env`, read only through `python-dotenv` 1.2.4 and `dotenv_values`.
- Only `META_API_KEY` is loaded. The file is never shell-sourced.
- The key was never placed in command-line arguments, printed, copied into the test directory, or written to results.
- The child Muse Code process receives a minimal environment containing the key; the key is not part of its command array.
- Shell tracing was disabled with `set +x`.
- The actual key was compared against every text artifact in the test directory. No match was found.
- `/home/azureuser/.hermes/.env` was not modified: mode 600, size 9125, mtime 2026-10-26 20:00:48 UTC.
- No `.env` copy exists in the test directory. `.env.example` contains variable names with blank values. `.gitignore` excludes `.env`, `.venv/`, WAV files, and result JSON.
- No `sudo` was used.
- No sandbox or approval setting was disabled.
- No OpenCode configuration was changed.
- No Baseten, Modal, Fireworks, or other inference provider was used. All inference requests went to `api.meta.ai`.
- Requests were sequential. Every recorded attempt used one attempt and no retry.
- Only synthetic test content was sent. The Meta free-credit notice states that content may be used to improve products.

## Limitations

- Text tests used the Chat Completions route. The documented Responses route was not exercised.
- Each final text result is one sample. Outputs may vary between runs.
- The output caps were conservative. Reasoning tokens count toward those caps; both models consumed most of their first-attempt budget on reasoning and produced little or no visible content.
- Only visible output was validated. Hidden reasoning was not requested or inspected.
- Muse Code did not expose its resolved model or token usage.
- Sandboxed tool execution in Muse Code was not tested because `bwrap` is absent.
- No cost calculation is included. Usage is reported exactly as returned by the APIs.
- The catalog reports `created=0` for every model, so the response cannot be used to infer release dates.

## Reproduction

Run from the test directory:

```bash
cd /home/azureuser/muse-model-smoke
.venv/bin/python -m unittest discover -s tests -v

META_ENV_FILE=/home/azureuser/.hermes/.env \
  .venv/bin/python scripts/run_muse_headless.py

META_ENV_FILE=/home/azureuser/.hermes/.env \
  bash scripts/run_all.sh
```

Notes:

- `run_all.sh` regenerates the WAV fixture and runs the catalog check plus Spark, Wonder, and Voice. It does not run the Muse Code headless test.
- The scripts read only `META_API_KEY` from the configured env file. Do not `source` the file.
- New runs create new timestamped files in `results/`. They do not overwrite this evidence.

## Evidence files

- `results/muse_code_2026-10-26T203426Z.json`
- `results/model_contracts_2026-10-26T203436Z.json`
- `results/muse_spark_2026-10-26T203436Z.json` (first attempt, budget exhausted)
- `results/muse_spark_2026-10-26T203502Z.json` (final behavioral result)
- `results/muse_wonder_2026-10-26T203439Z.json` (first attempt, budget exhausted)
- `results/muse_wonder_2026-10-26T203519Z.json` (final behavioral result)
- `results/muse_voice_2026-10-26T203444Z.json`

## Next action

Run one coached retest of only `muse-spark-1.3` and `muse-wonder-1.0` with an explicit instruction to state any unresolved time reference or conflicting constraint before answering. Keep today’s FAIL results as the baseline. If the coached retest still fails, add a ServiceLoop-side rejection gate instead of relying on either text model for booking constraint extraction.
