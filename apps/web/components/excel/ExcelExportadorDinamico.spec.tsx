import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ExcelExportadorDinamico from './ExcelExportadorDinamico';
const { descargar } = vi.hoisted(() => ({ descargar: vi.fn() }));
vi.mock('@/lib/export-excel', () => ({ exportToExcelAsync: descargar }));
vi.mock('@/components/UserContext', () => ({ useUser: () => ({user:{id:7}}) }));
const rows=[{fecha:'2026-10-01',persona:'Ana',estado:'APROBADO'},{fecha:'2026-11-16',persona:'Luis',estado:'BORRADOR'}];
function montar() {
  render(<ExcelExportadorDinamico preferenciaKey="test-cols" titulo="Prueba" filename="prueba" rows={rows}
    columns={[{key:'persona',label:'Persona'},{key:'estado',label:'Estado'}]} getFecha={r=>r.fecha}
    estadoKey="estado" estados={[{value:'APROBADO',label:'Aprobado'},{value:'BORRADOR',label:'Borrador'}]} getPersonaArea={r=>r.persona}/>);
  fireEvent.click(screen.getByRole('button',{name:'Exportar Excel'}));
}
describe('ExcelExportadorDinamico',()=>{
  beforeEach(()=>{descargar.mockReset();localStorage.clear();});
  it('exporta toda la lista filtrada sin recortarla al mes actual',async()=>{
    descargar.mockResolvedValue(undefined); montar();
    fireEvent.click(screen.getByRole('button',{name:'Descargar .xlsx'}));
    await waitFor(()=>expect(descargar).toHaveBeenCalled());
    expect(descargar.mock.calls[0][0]).toEqual(rows);
  });
  it('aplica persona y estado al archivo, no solo al contador',async()=>{
    descargar.mockResolvedValue(undefined); montar();
    fireEvent.change(screen.getByRole('combobox',{name:'Estado'}),{target:{value:'APROBADO'}});
    fireEvent.change(screen.getByLabelText('Persona o área'),{target:{value:'Ana'}});
    fireEvent.click(screen.getByRole('button',{name:'Descargar .xlsx'}));
    await waitFor(()=>expect(descargar).toHaveBeenCalled());
    expect(descargar.mock.calls[0][0]).toEqual([rows[0]]);
  });
  it('mantiene el progreso y muestra errores asíncronos para reintentar',async()=>{
    let rechazar!: (e:Error)=>void;
    descargar.mockReturnValue(new Promise((_,reject)=>{rechazar=reject;})); montar();
    fireEvent.click(screen.getByRole('button',{name:'Descargar .xlsx'}));
    expect(screen.getByRole('button',{name:'Generando…'})).toBeDisabled();
    rechazar(new Error('Sin conexión'));
    await waitFor(()=>expect(screen.getByRole('alert')).toHaveTextContent('Sin conexión'));
    expect(screen.getByRole('button',{name:'Descargar .xlsx'})).toBeEnabled();
  });
  it('rechaza rangos invertidos',()=>{
    montar();
    fireEvent.change(screen.getByLabelText('Desde'),{target:{value:'2026-11-20'}});
    fireEvent.change(screen.getByLabelText('Hasta'),{target:{value:'2026-11-01'}});
    expect(screen.getByRole('button',{name:'Descargar .xlsx'})).toBeDisabled();
  });
});
