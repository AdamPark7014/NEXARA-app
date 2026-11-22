import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import Cargos from './cargos-perdida/page';
import Medidas from './medidas/page';
const {sesion,request}=vi.hoisted(()=>({sesion:{token:'token' as string|null,user:{id:2,roleKey:'rh',nombre:'RH'}},request:vi.fn()}));
vi.mock('@/components/UserContext',()=>({useUser:()=>sesion}));
vi.mock('@/lib/api-base',()=>({apiRequest:(...a:unknown[])=>request(...a)}));
vi.mock('@/components/excel/ExcelExportadorDinamico',()=>({default:()=>null}));
describe.each([['cargos',Cargos],['medidas',Medidas]] as const)('%s: estados y permisos',(_,Page)=>{
  beforeEach(()=>{sesion.token='token';sesion.user.roleKey='rh';request.mockReset();});
  it('explica el vacío después de una carga correcta',async()=>{
    request.mockResolvedValue({ok:true,json:async()=>[]}); render(<Page/>);
    // Se espera el vacío mismo. Antes se esperaba a que «no hubiera status» y luego se leía el texto
    // sin esperar: mientras carga no hay ningún `status` (y el vacío sí lo es), así que pasaba solo
    // cuando la carga terminaba a tiempo y fallaba a ratos en el CI (7f90d88).
    expect(await screen.findByText(/No hay .*registrad/)).toBeInTheDocument();
    expect(screen.queryByText('Cargando…')).not.toBeInTheDocument();
  });
  it('muestra el error y permite reintentar',async()=>{
    request.mockRejectedValue(new Error('Sin conexión'));render(<Page/>);
    expect(await screen.findByRole('alert')).toHaveTextContent('Sin conexión');
    expect(screen.getByRole('button',{name:'Reintentar'})).toBeEnabled();
  });
  it('un rol sin permiso no consulta datos ni muestra formularios',()=>{
    sesion.user.roleKey='ing_campo';render(<Page/>);
    expect(screen.getByRole('alert')).toHaveTextContent('Solo RH');expect(request).not.toHaveBeenCalled();
  });
  it('sin sesión explica cómo continuar',()=>{
    sesion.token=null;render(<Page/>);expect(screen.getByText('Inicia sesión para continuar.')).toBeInTheDocument();
    expect(request).not.toHaveBeenCalled();
  });
});
