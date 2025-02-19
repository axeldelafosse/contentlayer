import type { HasCwd } from '@contentlayer/core'
import { provideCwd } from '@contentlayer/core'
import * as core from '@contentlayer/core'
import { DummyTracing, JaegerNodeTracing } from '@contentlayer/utils'
import type { HasClock, OT } from '@contentlayer/utils/effect'
import { Cause, pipe, pretty, T } from '@contentlayer/utils/effect'

export const runMain =
  ({ tracingServiceName, verbose }: { tracingServiceName: string; verbose: boolean }) =>
  (eff: T.Effect<OT.HasTracer & HasClock & HasCwd, unknown, unknown>) =>
    pipe(
      T.gen(function* ($) {
        if (process.platform === 'win32') {
          yield* $(T.log('Warning: Contentlayer might not work as expected on Windows'))
        }

        // Only use Otel tracing if explicitly enabled via env var
        const provideTracing =
          process.env.CL_OTEL !== undefined
            ? T.provideSomeLayer(JaegerNodeTracing(tracingServiceName))
            : T.provide(DummyTracing)

        const result = yield* $(pipe(eff, provideTracing, provideCwd, T.result))

        if (result._tag === 'Failure') {
          const failOrCause = Cause.failureOrCause(result.cause)
          const errorWasManaged = failOrCause._tag === 'Left'

          if (!errorWasManaged) {
            yield* $(
              T.log(`\
This error shouldn't have happened. Please consider opening a GitHub issue with the stack trace below here:
https://github.com/contentlayerdev/contentlayer/issues`),
            )
          }

          // If failure was a managed error and no `--verbose` flag was provided, print the error message
          if (errorWasManaged && !verbose) {
            if (!core.isSourceFetchDataError(failOrCause.left) || !failOrCause.left.alreadyHandled) {
              yield* $(T.log(failOrCause.left))
            }
          }
          // otherwise for unmanaged errors or with `--verbose` flag provided, print the entire stack trace
          else {
            yield* $(T.log(pretty(result.cause)))
          }

          yield* $(T.succeedWith(() => process.exit(1)))
        }
      }),
      T.runPromise,
    )
