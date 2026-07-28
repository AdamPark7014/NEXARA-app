import {

  CallHandler,

  ConflictException,

  ExecutionContext,

  Injectable,

  NestInterceptor,

} from '@nestjs/common';

import { createHash } from 'node:crypto';

import { PrismaService } from '../../prisma/prisma.service.js';



const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

const TTL_HOURS = 24;



/**

 * Stripe-style Idempotency-Key.

 * Cast `as any` + require local rxjs evita conflicto de tipos por rxjs duplicado en monorepo.

 * Scoped by companyId so tenants can reuse the same key independently.

 */

@Injectable()

export class IdempotencyInterceptor implements NestInterceptor {

  constructor(private readonly prisma: PrismaService) {}



  intercept(context: ExecutionContext, next: CallHandler): any {

    const req = context.switchToHttp().getRequest<any>();

    const res = context.switchToHttp().getResponse<any>();

    const method = String(req?.method || '').toUpperCase();

    if (!MUTATING.has(method)) return next.handle();



    const key = String(req?.headers?.['idempotency-key'] || '').trim();

    if (!key) return next.handle();

    if (key.length > 120) throw new ConflictException('Idempotency-Key demasiado larga');



    const path = String(req?.originalUrl || req?.url || '').split('?')[0].slice(0, 300);

    const companyId =

      req?.companyId != null && Number.isFinite(Number(req.companyId))

        ? Number(req.companyId)

        : null;

    // Without a tenant, skip store — avoid cross-tenant key collisions under nullable unique.

    if (companyId == null) return next.handle();



    const userId = req?.user?.id != null ? Number(req.user.id) : null;

    const bodyStr =

      typeof req?.body === 'string' ? req.body : JSON.stringify(req?.body ?? {});

    const requestHash = createHash('sha256').update(bodyStr).digest('hex');



    // eslint-disable-next-line @typescript-eslint/no-require-imports

    const { from } = require('rxjs');

    // eslint-disable-next-line @typescript-eslint/no-require-imports

    const { switchMap, tap } = require('rxjs/operators');



    return from(

      this.prisma.idempotencyKey.findUnique({

        where: {

          companyId_key_method_path: { companyId, key, method, path },

        },

      }),

    ).pipe(

      switchMap((existing: any) => {

        if (existing && existing.expiresAt.getTime() > Date.now()) {

          if (existing.requestHash && existing.requestHash !== requestHash) {

            throw new ConflictException(

              'Idempotency-Key reutilizada con body distinto',

            );

          }

          res.status(existing.statusCode);

          // eslint-disable-next-line @typescript-eslint/no-require-imports

          const { of } = require('rxjs');

          return of(existing.responseBody ?? { ok: true, idempotent: true });

        }



        return (next.handle() as any).pipe(

          tap(async (data: unknown) => {

            const statusCode = Number(res?.statusCode || 200);

            const expiresAt = new Date(Date.now() + TTL_HOURS * 3600_000);

            try {

              await this.prisma.idempotencyKey.upsert({

                where: {

                  companyId_key_method_path: { companyId, key, method, path },

                },

                create: {

                  key,

                  method,

                  path,

                  requestHash,

                  statusCode,

                  responseBody: data as object,

                  companyId,

                  userId: Number.isFinite(userId as number) ? userId : null,

                  expiresAt,

                },

                update: {

                  requestHash,

                  statusCode,

                  responseBody: data as object,

                  expiresAt,

                },

              });

            } catch {

              // no bloquear la respuesta si falla el store

            }

          }),

        );

      }),

    );

  }

}


