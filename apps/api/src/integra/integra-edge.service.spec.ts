import { createHash } from 'node:crypto';
import { ForbiddenException } from '@nestjs/common';
import { IntegraEdgeService } from './integra-edge.service';

const sha256 = (s: string) => createHash('sha256').update(s, 'utf8').digest('hex');

/** Clave WireGuard con la forma real: 32 bytes en base64. */
const WG_KEY = 'K5j8vQm2xR7nT4wY9aZ1bC3dE6fG0hI2jK4lM6nO8p0=';

type Row = Record<string, any>;

/**
 * Prisma en memoria, solo con lo que este servicio usa. Se prefiere a un mock
 * por llamada porque lo que hay que probar es el efecto sobre la fila —
 * que el token se queme, que la IP no se repita— no qué método se invocó.
 */
function fakePrisma(sites: Row[] = [{ id: 1, companyId: 7, name: 'Oficinas' }]) {
  const agents: Row[] = [];
  return {
    agents,
    integraSite: {
      findFirst: jest.fn(async ({ where }: any) =>
        sites.find((s) => s.id === where.id && s.companyId === where.companyId) ?? null,
      ),
    },
    integraEdgeAgent: {
      findMany: jest.fn(async ({ where = {}, select }: any) => {
        let rows = agents.filter((a) => {
          if (where.status && a.status !== where.status) return false;
          if (where.companyId != null && a.companyId !== where.companyId) return false;
          for (const [k, v] of Object.entries(where)) {
            if (v && typeof v === 'object' && 'not' in (v as any)) {
              if ((v as any).not === null && a[k] == null) return false;
            }
          }
          return true;
        });
        if (select) {
          rows = rows.map((r) =>
            Object.fromEntries(Object.keys(select).map((k) => [k, r[k]])),
          );
        }
        return rows.map((r) => ({ ...r, site: { name: 'Oficinas' } }));
      }),
      findFirst: jest.fn(async ({ where }: any) =>
        agents.find(
          (a) =>
            (where.siteId == null || a.siteId === where.siteId) &&
            (where.companyId == null || a.companyId === where.companyId),
        ) ?? null,
      ),
      upsert: jest.fn(async ({ where, create, update }: any) => {
        const found = agents.find((a) => a.siteId === where.siteId);
        if (found) Object.assign(found, update);
        else agents.push({ ...create });
        return found ?? agents[agents.length - 1];
      }),
      update: jest.fn(async ({ where, data }: any) => {
        const found = agents.find((a) => a.siteId === where.siteId);
        Object.assign(found, data);
        return found;
      }),
    },
  } as any;
}

const CONFIG: Record<string, string> = {
  INTEGRA_EDGE_WG_SUBNET: '10.77.0.0/24',
  INTEGRA_EDGE_WG_SERVER_PUBKEY: 'SRVpubKEYbase64AAAAAAAAAAAAAAAAAAAAAAAAAAAA=',
  INTEGRA_EDGE_WG_ENDPOINT: '5.78.215.109:51820',
  INTEGRA_EDGE_API_URL: 'https://integra.nexara.com.mx',
  INTEGRA_EDGE_RECONCILE_TOKEN: 'token-del-reconciliador',
};

function build(prisma = fakePrisma()) {
  const config = { get: (k: string) => CONFIG[k] } as any;
  const audit = { log: jest.fn(async () => undefined) } as any;
  return { svc: new IntegraEdgeService(prisma, config, audit), prisma };
}

describe('IntegraEdgeService · alta de la caja', () => {
  it('guarda solo el hash del token de alta, nunca el token', async () => {
    const { svc, prisma } = build();
    const { token } = await svc.issueEnrollToken(7, 1);

    expect(token).toHaveLength(43); // 32 bytes en base64url
    const row = prisma.agents[0];
    expect(row.enrollTokenHash).toBe(sha256(token));
    expect(JSON.stringify(row)).not.toContain(token);
  });

  it('enrola: asigna la primera IP libre y devuelve la configuración del túnel', async () => {
    const { svc } = build();
    const { token } = await svc.issueEnrollToken(7, 1);

    const res = await svc.enroll({ token, publicKey: WG_KEY, hostname: 'caja-oficinas' });

    expect(res.tunnelIp).toBe('10.77.0.2'); // .1 es el servidor
    expect(res.tunnelCidr).toBe('10.77.0.2/32');
    expect(res.serverEndpoint).toBe('5.78.215.109:51820');
    expect(res.keepalive).toBe(25);
    expect(res.agentToken).toHaveLength(43);
    expect(res.siteId).toBe(1);
  });

  it('la caja enruta solo el túnel, nunca la LAN del cliente', async () => {
    // Es la garantía que evita que dos sitios con 192.168.1.0/24 choquen.
    const { svc } = build();
    const { token } = await svc.issueEnrollToken(7, 1);
    const res = await svc.enroll({ token, publicKey: WG_KEY });

    expect(res.allowedIps).toBe('10.77.0.0/24');
    expect(res.allowedIps).not.toMatch(/192\.168\./);
  });

  it('el token de alta es de un solo uso', async () => {
    const { svc } = build();
    const { token } = await svc.issueEnrollToken(7, 1);
    await svc.enroll({ token, publicKey: WG_KEY });

    await expect(svc.enroll({ token, publicKey: WG_KEY })).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('rechaza un token expirado', async () => {
    const { svc, prisma } = build();
    const { token } = await svc.issueEnrollToken(7, 1);
    prisma.agents[0].enrollTokenExpiresAt = new Date(Date.now() - 1000);

    await expect(svc.enroll({ token, publicKey: WG_KEY })).rejects.toThrow(/expirado/i);
  });

  it('rechaza un token inventado', async () => {
    const { svc } = build();
    await svc.issueEnrollToken(7, 1);
    await expect(
      svc.enroll({ token: 'no-es-un-token', publicKey: WG_KEY }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rechaza una clave que no tiene forma de clave WireGuard', async () => {
    const { svc } = build();
    const { token } = await svc.issueEnrollToken(7, 1);
    await expect(svc.enroll({ token, publicKey: 'aaa' })).rejects.toThrow(/publicKey/);
  });

  it('reinstalar con un token nuevo conserva la misma IP del sitio', async () => {
    // Si cada reinstalación quemara una IP, el /24 se agotaría con el tiempo.
    const { svc } = build();
    const first = await svc.issueEnrollToken(7, 1);
    const a = await svc.enroll({ token: first.token, publicKey: WG_KEY });

    const second = await svc.issueEnrollToken(7, 1);
    const b = await svc.enroll({ token: second.token, publicKey: WG_KEY });

    expect(b.tunnelIp).toBe(a.tunnelIp);
  });

  it('re-emitir el token invalida al agente anterior', async () => {
    const { svc, prisma } = build();
    const first = await svc.issueEnrollToken(7, 1);
    const enrolled = await svc.enroll({ token: first.token, publicKey: WG_KEY });

    await svc.issueEnrollToken(7, 1);

    expect(prisma.agents[0].agentTokenHash).toBeNull();
    await expect(svc.heartbeat(enrolled.agentToken, {})).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('dos sitios reciben IPs distintas', async () => {
    const prisma = fakePrisma([
      { id: 1, companyId: 7, name: 'Oficinas' },
      { id: 2, companyId: 7, name: 'Sucursal' },
    ]);
    const { svc } = build(prisma);

    const t1 = await svc.issueEnrollToken(7, 1);
    const t2 = await svc.issueEnrollToken(7, 2);
    const a = await svc.enroll({ token: t1.token, publicKey: WG_KEY });
    const b = await svc.enroll({ token: t2.token, publicKey: WG_KEY });

    expect(a.tunnelIp).toBe('10.77.0.2');
    expect(b.tunnelIp).toBe('10.77.0.3');
  });
});

describe('IntegraEdgeService · latido y reconciliador', () => {
  it('el latido registra la vida y guarda el error reportado', async () => {
    const { svc, prisma } = build();
    const { token } = await svc.issueEnrollToken(7, 1);
    const { agentToken } = await svc.enroll({ token, publicKey: WG_KEY });

    const res = await svc.heartbeat(agentToken, {
      agentVersion: '1.0.0',
      error: 'go2rtc caído',
    });

    expect(res.ok).toBe(true);
    expect(res.heartbeatSeconds).toBe(60);
    expect(prisma.agents[0].lastError).toBe('go2rtc caído');
    expect(prisma.agents[0].lastSeenAt).toBeInstanceOf(Date);
  });

  it('un latido sin error limpia el error anterior', async () => {
    const { svc, prisma } = build();
    const { token } = await svc.issueEnrollToken(7, 1);
    const { agentToken } = await svc.enroll({ token, publicKey: WG_KEY });

    await svc.heartbeat(agentToken, { error: 'sin handshake' });
    await svc.heartbeat(agentToken, {});

    expect(prisma.agents[0].lastError).toBeNull();
  });

  it('el reconciliador solo entrega peers con su propio token', async () => {
    const { svc } = build();
    const { token } = await svc.issueEnrollToken(7, 1);
    await svc.enroll({ token, publicKey: WG_KEY });

    await expect(svc.peersForReconciler('otro-token')).rejects.toBeInstanceOf(
      ForbiddenException,
    );

    const { peers } = await svc.peersForReconciler('token-del-reconciliador');
    expect(peers).toEqual([{ siteId: 1, publicKey: WG_KEY, allowedIps: '10.77.0.2/32' }]);
  });

  it('marca offline una caja que lleva más de cinco minutos sin latir', async () => {
    const { svc, prisma } = build();
    const { token } = await svc.issueEnrollToken(7, 1);
    await svc.enroll({ token, publicKey: WG_KEY });

    prisma.agents[0].lastSeenAt = new Date(Date.now() - 6 * 60 * 1000);
    expect((await svc.list(7))[0].online).toBe(false);

    prisma.agents[0].lastSeenAt = new Date();
    expect((await svc.list(7))[0].online).toBe(true);
  });
});
