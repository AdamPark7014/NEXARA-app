"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import styles from "../tienda-new.module.css";

type CartItem = {
  id: string;
  name?: string;
  price?: number | string;
  currency?: string;
  image?: string;
  quantity: number;
};

export default function CarritoPage() {
  const [cart, setCart] = useState<CartItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [dollarRate, setDollarRate] = useState<number>(20);

  // Función para obtener el tipo de cambio
  const fetchDollarRate = async () => {
    try {
      const response = await fetch('https://api.exchangerate-api.com/v4/latest/USD');
      if (response.ok) {
        const data = await response.json();
        setDollarRate(data.rates?.MXN || 20);
        return;
      }
    } catch {
      console.log('Error fetching from exchangerate-api');
    }

    try {
      const response = await fetch('https://open.er-api.com/v6/latest/USD');
      if (response.ok) {
        const data = await response.json();
        setDollarRate(data.rates?.MXN || 20);
        return;
      }
    } catch {
      console.log('Error fetching from open.er-api');
    }
  };

  // Cargar carrito del localStorage
  useEffect(() => {
    try {
      const savedCart = JSON.parse(localStorage.getItem('nexara-cart') || '[]') as CartItem[];
      setCart(savedCart);
    } catch (error) {
      console.error('Error loading cart:', error);
      setCart([]);
    } finally {
      setLoading(false);
    }
    
    // Obtener tipo de cambio
    fetchDollarRate();
  }, []);

  // Escuchar cambios del carrito desde otras pestañas
  useEffect(() => {
    const handleCartUpdate = () => {
      try {
        const savedCart = JSON.parse(localStorage.getItem('nexara-cart') || '[]') as CartItem[];
        setCart(savedCart);
      } catch (error) {
        console.error('Error updating cart:', error);
      }
    };

    window.addEventListener('cartUpdated', handleCartUpdate);
    window.addEventListener('storage', handleCartUpdate);

    return () => {
      window.removeEventListener('cartUpdated', handleCartUpdate);
      window.removeEventListener('storage', handleCartUpdate);
    };
  }, []);

  const updateQuantity = (id: string, quantity: number) => {
    const updated = cart
      .map(item => item.id === id ? { ...item, quantity: Math.max(1, quantity) } : item)
      .filter(item => item.quantity > 0);
    setCart(updated);
    localStorage.setItem('nexara-cart', JSON.stringify(updated));
    window.dispatchEvent(new CustomEvent('cartUpdated', { detail: { cart: updated } }));
  };

  const removeItem = (id: string) => {
    const updated = cart.filter(item => item.id !== id);
    setCart(updated);
    localStorage.setItem('nexara-cart', JSON.stringify(updated));
    window.dispatchEvent(new CustomEvent('cartUpdated', { detail: { cart: updated } }));
  };

  const clearCart = () => {
    if (confirm('¿Deseas limpiar todo el carrito?')) {
      setCart([]);
      localStorage.setItem('nexara-cart', JSON.stringify([]));
      window.dispatchEvent(new CustomEvent('cartUpdated', { detail: { cart: [] } }));
    }
  };

  const total = cart.reduce((sum, item) => {
    const price = typeof item.price === 'string' ? Number(item.price) : item.price || 0;
    // Convertir USD a MXN si es necesario
    const priceInMXN = item.currency === 'USD' ? price * dollarRate : price;
    return sum + priceInMXN * item.quantity;
  }, 0);

  const totalItems = cart.reduce((sum, item) => sum + item.quantity, 0);

  if (loading) {
    return (
      <main className={styles.page}>
        <div className={styles.cartEmptyState}>
          <p>Cargando carrito...</p>
        </div>
      </main>
    );
  }

  return (
    <main className={styles.page}>
      <section className={styles.hero}>
        <div>
          <p className={styles.kicker}>Tu Compra</p>
          <h1 className={styles.title}>Carrito de Compras</h1>
          <p className={styles.subtitle}>
            Revisa los productos que has seleccionado y procede al pago.
          </p>
        </div>
        <div className={styles.heroBadge}>{totalItems} artículos</div>
      </section>

      {cart.length === 0 ? (
        <div className={styles.cartEmptyState}>
          <div className={styles.emptyIcon}>🛒</div>
          <h2>Tu carrito está vacío</h2>
          <p>Aún no has agregado productos. ¡Vuelve a la tienda y comienza tu compra!</p>
          <Link href="/tienda" className={styles.emptyStateBtn}>
            Ir a la Tienda
          </Link>
        </div>
      ) : (
        <div className={styles.cartContainer}>
          <div className={styles.cartItems}>
            {cart.map((item) => (
              <div key={item.id} className={styles.cartItem}>
                <div className={styles.cartItemImage}>
                  {item.image ? (
                    <Image
                      src={item.image}
                      alt={item.name || "Producto"}
                      fill
                      className={styles.cartItemImg}
                    />
                  ) : (
                    <div className={styles.cartItemImgFallback}>Sin imagen</div>
                  )}
                </div>

                <div className={styles.cartItemDetails}>
                  <h3 className={styles.cartItemName}>{item.name || 'Producto'}</h3>
                  <p className={styles.cartItemPrice}>
                    ${typeof item.price === 'string' ? Number(item.price).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : item.price?.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {item.currency || 'MXN'}
                  </p>
                </div>

                <div className={styles.cartItemQuantity}>
                  <button
                    className={styles.qtyBtn}
                    onClick={() => updateQuantity(item.id, item.quantity - 1)}
                    title="Disminuir cantidad"
                  >
                    −
                  </button>
                  <input
                    type="number"
                    min="1"
                    value={item.quantity}
                    onChange={(e) => updateQuantity(item.id, Number(e.target.value))}
                    className={styles.qtyInput}
                  />
                  <button
                    className={styles.qtyBtn}
                    onClick={() => updateQuantity(item.id, item.quantity + 1)}
                    title="Aumentar cantidad"
                  >
                    +
                  </button>
                </div>

                <div className={styles.cartItemTotal}>
                  <p className={styles.cartItemTotalPrice}>
                    ${(() => {
                      const price = typeof item.price === 'string' ? Number(item.price) : item.price || 0;
                      const priceInMXN = item.currency === 'USD' ? price * dollarRate : price;
                      return (priceInMXN * item.quantity).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
                    })()}
                  </p>
                </div>

                <button
                  className={styles.cartItemRemove}
                  onClick={() => removeItem(item.id)}
                  title="Remover del carrito"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>

          <div className={styles.cartSummary}>
            <div className={styles.summaryRow}>
              <span>Subtotal ({totalItems} artículos)</span>
              <span>${total.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
            </div>
            {cart.some(item => item.currency === 'USD') && (
              <div className={styles.summaryNote}>
                * Precios en USD convertidos a MXN (${dollarRate.toFixed(2)})
              </div>
            )}
            <div className={styles.summaryRow}>
              <span>Envío</span>
              <span className={styles.summaryShipping}>Calculado al checkout</span>
            </div>
            <div className={styles.summaryDivider}></div>
            <div className={styles.summaryRow + ' ' + styles.summaryTotal}>
              <span>Total</span>
              <span>${total.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
            </div>

            <button className={styles.checkoutBtn}>
              Proceder al Pago
            </button>

            <button className={styles.continueShopping} onClick={clearCart}>
              Limpiar Carrito
            </button>

            <Link href="/tienda" className={styles.continueShopping}>
              Continuar Comprando
            </Link>
          </div>
        </div>
      )}
    </main>
  );
}
