"use client";

import { useState } from "react";

type ProductActionsProps = {
  productName: string;
  productId: string;
  price: number;
  currency?: string;
  image?: string;
};

export default function ProductActions({
  productName,
  productId,
  price,
  currency,
  image,
}: ProductActionsProps) {
  const [addedToCart, setAddedToCart] = useState(false);

  const handleAddToCart = () => {
    const cart = JSON.parse(localStorage.getItem("nexara-cart") || "[]") as Array<{
      id: string;
      name: string;
      price: number;
      currency: string;
      image?: string;
      quantity: number;
    }>;
    
    const existingItem = cart.find((item) => item.id === productId);
    if (existingItem) {
      existingItem.quantity += 1;
    } else {
      cart.push({
        id: productId,
        name: productName,
        price,
        currency: currency || "MXN",
        image,
        quantity: 1,
      });
    }
    localStorage.setItem("nexara-cart", JSON.stringify(cart));
    setAddedToCart(true);
    setTimeout(() => setAddedToCart(false), 1500);
  };

  return (
    <button onClick={handleAddToCart} disabled={addedToCart} style={{ padding: "0.5rem 1rem", background: addedToCart ? "#4caf50" : "#007bff", color: "#fff", border: "none", borderRadius: "4px", cursor: "pointer" }}>
      {addedToCart ? "Agregado" : "Agregar al carrito"}
    </button>
  );
}
