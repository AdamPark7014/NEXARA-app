
import SidebarMenu from '../../components/SidebarMenu';

export default function PanelAdminPage() {
	return (
		<div style={{ display: 'flex', minHeight: '100vh' }}>
			<SidebarMenu />
			<main style={{ flex: 1, padding: 24 }}>
				<h1>Panel de Administración Console</h1>
				{/* Aquí se renderizarán los módulos según la ruta y el rol */}
			</main>
		</div>
	);
}
