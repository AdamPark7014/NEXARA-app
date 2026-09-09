```typescript
import React, { useState, useEffect } from "react";
import { useRouter } from "next/router";
import { useQuery } from "@tanstack/react-query";
import { Button, Section, Link, Input } from "@components";
import { getActiveProjects, getUsers, getPendingRequests, createOT, updateOT } from "@api";
import { PRIORIDAD_LIST } from "@utils";

const gridStyle = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: 12,
  marginBottom: 16,
};

export default function OTForm({ activityId = null, isEdit = false, onSuccess = null }) {
  const router = useRouter();
  const [form, setForm] = useState({
    titulo: "",
    projectId: "",
    clientId: "",
    ticketType: "PREVENTIVO",
    ticketTypeCustom: "",
    responsableId: "",
    prioridad: "MEDIOPRIO",
    fecha: new Date().toISOString().split("T")[0],
    tiempoEstimadoMin: 0,
    tiempoMaximoMin: 0,
    branchName: "",
    branchNumber: "",
    branchCity: "",
    branchState: "",
    branchAddress: "",
    indicaciones: "",
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [canAssign, setCanAssign] = useState(true);
  const [nextAn, setNextAn] = useState(null);
  const [nextAnLoaded, setNextAnLoaded] = useState(false);
  const [pendingRequestId, setPendingRequestId] = useState(null);
  const [users, setUsers] = useState([]);
  const [showOtroModal, setShowOtroModal] = useState(false);
  const [otroInput, setOtroInput] = useState("");

  const { data: activeProjects } = useQuery(["activeProjects"], getActiveProjects);
  const { data: usersData } = useQuery(["users"], getUsers);
  const { data: pendingRequests } = useQuery(["pendingRequests"], getPendingRequests);

  useEffect(() => {
    if (isEdit) {
      setForm({
        ...form,
        titulo: activityId.titulo,
        projectId: activityId.projectId,
        clientId: activityId.clientId,
        ticketType: activityId.ticketType,
        ticketTypeCustom: activityId.ticketTypeCustom,
        responsableId: activityId.responsableId,
        prioridad: activityId.prioridad,
        fecha: activityId.fecha,
        tiempoEstimadoMin: activityId.tiempoEstimadoMin,
        tiempoMaximoMin: activityId.tiempoMaximoMin,
        branchName: activityId.branchName,
        branchNumber: activityId.branchNumber,
        branchCity: activityId.branchCity,
        branchState: activityId.branchState,
        branchAddress: activityId.branchAddress,
        indicaciones: activityId.indicaciones,
      });
    }
  }, [activityId, isEdit]);

  useEffect(() => {
    if (activeProjects) {
      setForm({ ...form, clientId: activeProjects[0].client.id });
    }
  }, [activeProjects]);

  useEffect(() => {
    if (usersData) {
      setUsers(usersData);
    }
  }, [usersData]);

  useEffect(() => {
    if (pendingRequests) {
      setPendingRequestId(pendingRequests[0]?.id);
    }
  }, [pendingRequests]);

  useEffect(() => {
    if (activeProjects) {
      const project = activeProjects.find((p) => String(p.id) === form.projectId);
      if (project) {
        setForm({ ...form, clientId: String(project.client.id) });
      }
    }
  }, [form.projectId, activeProjects]);

  useEffect(() => {
    if (form.ticketType === "OTRO") {
      setForm({ ...form, workType: "ISSUE" });
      setOtroInput(form.ticketTypeCustom || "");
      setShowOtroModal(true);
    } else {
      setForm({
        ...form,
        ticketTypeCustom: "",
        workType: form.ticketType === "INVENTARIO" ? "PREVENTIVE_INVENTORY" : "ISSUE",
      });
    }
  }, [form.ticketType]);

  useEffect(() => {
    if (form.ticketType === "OTRO") {
      setForm({ ...form, workType: "ISSUE" });
      setOtroInput(form.ticketTypeCustom || "");
      setShowOtroModal(true);
    } else {
      setForm({
        ...form,
        ticketTypeCustom: "",
        workType: form.ticketType === "INVENTARIO" ? "PREVENTIVE_INVENTORY" : "ISSUE",
      });
    }
  }, [form.ticketType]);

  useEffect(() => {
    if (form.ticketType === "OTRO") {
      setForm({ ...form, workType: "ISSUE" });
      setOtroInput(form.ticketTypeCustom || "");
      setShowOtroModal(true);
    } else {
      setForm({
        ...form,
        ticketTypeCustom: "",
        workType: form.ticketType === "INVENTARIO" ? "PREVENTIVE_INVENTORY" : "ISSUE",
      });
    }
  }, [form.ticketType]);

  useEffect(() => {
    if (form.ticketType === "OTRO") {
      setForm({ ...form, workType: "ISSUE" });
      setOtroInput(form.ticketTypeCustom || "");
      setShowOtroModal(true);
    } else {
      setForm({
        ...form,
        ticketTypeCustom: "",
        workType: form.ticketType === "INVENTARIO" ? "PREVENTIVE_INVENTORY" : "ISSUE",
      });
    }
  }, [form.ticketType]);

  useEffect(() => {
    if (form.ticketType === "OTRO") {
      setForm({ ...form, workType: "ISSUE" });
      setOtroInput(form.ticketTypeCustom || "");
      setShowOtroModal(true);
    } else {
      setForm({
        ...form,
        ticketTypeCustom: "",
        workType: form.ticketType === "INVENTARIO" ? "PREVENTIVE_INVENTORY" : "ISSUE",
      });
    }
  }, [form.ticketType]);

  useEffect(() => {
    if (form.ticketType === "OTRO") {
      setForm({ ...form, workType: "ISSUE" });
      setOtroInput(form.ticketTypeCustom || "");
      setShowOtroModal(true);
    } else {
      setForm({
        ...form,
        ticketTypeCustom: "",
        workType: form.ticketType === "INVENTARIO" ? "PREVENTIVE_INVENTORY" : "ISSUE",
      });
    }
  }, [form.ticketType]);

  useEffect(() => {
    if (form.ticketType === "OTRO") {
      setForm({ ...form, workType: "ISSUE" });
      setOtroInput(form.ticketTypeCustom || "");
      setShowOtroModal(true);
    } else {
      setForm({
        ...form,
        ticketTypeCustom: "",
        workType: form.ticketType === "INVENTARIO" ? "PREVENTIVE_INVENTORY" : "ISSUE",
      });
    }
  }, [form.ticketType]);

  useEffect(() => {
    if (form.ticketType === "OTRO") {
      setForm({ ...form, workType: "ISSUE" });
      setOtroInput(form.ticketTypeCustom || "");
      setShowOtroModal(true);
    } else {
      setForm({
        ...form,
        ticketTypeCustom: "",
        workType: form.ticketType === "INVENTARIO" ? "PREVENTIVE_INVENTORY" : "ISSUE",
      });
    }
  }, [form.ticketType]);

  useEffect(() => {
    if (form.ticketType === "OTRO") {
      setForm({ ...form, workType: "ISSUE" });
      setOtroInput(form.ticketTypeCustom || "");
      setShowOtroModal(true);
    } else {
      setForm({
        ...form,
        ticketTypeCustom: "",
        workType: form.ticketType === "INVENTARIO" ? "PREVENTIVE_INVENTORY" : "ISSUE",
      });
    }
  }, [form.ticketType]);

  useEffect(() => {
    if (form.ticketType === "OTRO") {
      setForm({ ...form, workType: "ISSUE" });
      setOtroInput(form.ticketTypeCustom || "");
      setShowOtroModal(true);
    } else {
      setForm({
        ...form,
        ticketTypeCustom: "",
        workType: form.ticketType === "INVENTARIO" ? "PREVENTIVE_INVENTORY" : "ISSUE",
      });
    }
  }, [form.ticketType]);

  useEffect(() => {
    if (form.ticketType === "OTRO") {
      setForm({ ...form, workType: "ISSUE" });
      setOtroInput(form.ticketTypeCustom || "");
      setShowOtroModal(true);
    } else {
      setForm({
        ...form,
        ticketTypeCustom: "",
        workType: form.ticketType === "INVENTARIO" ? "PREVENTIVE_INVENTORY" : "ISSUE",
      });
    }
  }, [form.ticketType]);

  useEffect(() => {
    if (form.ticketType === "OTRO") {
      setForm({ ...form, workType: "ISSUE" });
      setOtroInput(form.ticketTypeCustom || "");
      setShowOtroModal(true);
    } else {
      setForm({
        ...form,
        ticketTypeCustom: "",
        workType: form.ticketType === "INVENTARIO" ? "PREVENTIVE_INVENTORY" : "ISSUE",
      });
    }
  }, [form.ticketType]);

  useEffect(() => {
    if (form.ticketType === "OTRO") {
      setForm({ ...form, workType: "ISSUE" });
      setOtroInput(form.ticketTypeCustom || "");
      setShowOtroModal(true);
    } else {
      setForm({
        ...form,
        ticketTypeCustom: "",
        workType: form.ticketType === "INVENTARIO" ? "PREVENTIVE_INVENTORY" : "ISSUE",
      });
    }
  }, [form.ticketType]);

  useEffect(() => {
    if (form.ticketType === "OTRO") {
      setForm({ ...form, workType: "ISSUE" });
      setOtroInput(form.ticketTypeCustom || "");
      setShowOtroModal(true);
    } else {
      setForm({
        ...form,
        ticketTypeCustom: "",
        workType: form.ticketType === "INVENTARIO" ? "PREVENTIVE_INVENTORY" : "ISSUE",
      });
    }
  }, [form.ticketType]);

  useEffect(() => {
    if (form.ticketType === "OTRO") {
      setForm({ ...form, workType: "ISSUE" });
      setOtroInput(form.ticketTypeCustom || "");
      setShowOtroModal(true);
    } else {
      setForm({
        ...form,
        ticketTypeCustom: "",
        workType: form.ticketType === "INVENTARIO" ? "PREVENTIVE_INVENTORY" : "ISSUE",
      });
    }
  }, [form.ticketType]);

  useEffect(() => {
    if (form.ticketType === "OTRO") {
      setForm({ ...form, workType: "ISSUE" });
      setOtroInput(form.ticketTypeCustom || "");
      setShowOtroModal(true);
    } else {
      setForm({
        ...form,
        ticketTypeCustom: "",
        workType: form.ticketType === "INVENTARIO" ? "PREVENTIVE_INVENTORY" : "ISSUE",
      });
    }
  }, [form.ticketType]);

  useEffect(() => {
    if (form.ticketType === "OTRO") {
      setForm({ ...form, workType: "ISSUE" });
      setOtroInput(form.ticketTypeCustom || "");
      setShowOtroModal(true);
    } else {
      setForm({
        ...form,
        ticketTypeCustom: "",
        workType: form.ticketType === "INVENTARIO" ? "PREVENTIVE_INVENTORY" : "ISSUE",
      });
    }
  }, [form.ticketType]);

  useEffect(() => {
    if (form.ticketType === "OTRO") {
      setForm({ ...form, workType: "ISSUE" });
      setOtroInput(form.ticketTypeCustom || "");
      setShowOtroModal(true);
    } else {
      setForm({
        ...form,
        ticketTypeCustom: "",
        workType: form.ticketType === "INVENTARIO" ? "PREVENTIVE_INVENTORY" : "ISSUE",
      });
    }
  }, [form.ticketType]);

  useEffect(() => {
    if (form.ticketType === "OTRO") {
      setForm({ ...form, workType: "ISSUE" });
      setOtroInput(form.ticketTypeCustom || "");
      setShowOtroModal(true);
    } else {
      setForm({
        ...form,
        ticketTypeCustom: "",
        workType: form.ticketType === "INVENTARIO" ? "PREVENTIVE_INVENTORY" : "ISSUE",
      });
    }
  }, [form.ticketType]);

  useEffect(() => {
    if (form.ticketType === "OTRO") {
      setForm({ ...form, workType: "ISSUE" });
      setOtroInput(form.ticketTypeCustom || "");
      setShowOtroModal(true);
    } else {
      setForm({
        ...form,
        ticketTypeCustom: "",
        workType: form.ticketType === "INVENTARIO" ? "PREVENTIVE_INVENTORY" : "ISSUE",
      });
    }
  }, [form.ticketType]);

  useEffect(() => {
    if (form.ticketType === "OTRO") {
      setForm({ ...form, workType: "ISSUE" });
      setOtroInput(form.ticketTypeCustom || "");
      setShowOtroModal(true);
    } else {
      setForm({
        ...form,
        ticketTypeCustom: "",
        workType: form.ticketType === "INVENTARIO" ? "PREVENTIVE_INVENTORY" : "ISSUE",
      });
    }
  }, [form.ticketType]);

  useEffect(() => {
    if (form.ticketType === "OTRO") {
      setForm({ ...form, workType: "ISSUE" });
      setOtroInput(form.ticketTypeCustom || "");
      setShowOtroModal(true);
    } else {
      setForm({
        ...form,
        ticketTypeCustom: "",
        workType: form.ticketType === "INVENTARIO" ? "PREVENTIVE_INVENTORY" : "ISSUE",
      });
    }
  }, [form.ticketType]);

  useEffect(() => {
    if (form.ticketType === "OTRO") {
      setForm({ ...form, workType: "ISSUE" });
      setOtroInput(form.ticketTypeCustom || "");
      setShowOtroModal(true);
    } else {
      setForm({
        ...form,
        ticketTypeCustom: "",
        workType: form.ticketType === "INVENTARIO" ? "PREVENTIVE_INVENTORY" : "ISSUE",
      });
    }
  }, [form.ticketType]);

  useEffect(() => {
    if (form.ticketType === "OTRO") {
      setForm({ ...form, workType: "ISSUE" });
      setOtroInput(form.ticketTypeCustom || "");
      setShowOtroModal(true);
    } else {
      setForm({
        ...form,
        ticketTypeCustom: "",
        workType: form.ticketType === "INVENTARIO" ? "PREVENTIVE_INVENTORY" : "ISSUE",
      });
    }
  }, [form.ticketType]);

  useEffect(() => {
    if (form.ticketType === "OTRO") {
      setForm({ ...form, workType: "ISSUE" });
      setOtroInput(form.ticketTypeCustom || "");
      setShowOtroModal(true);
    } else {
      setForm({
        ...form,
        ticketTypeCustom: "",
        workType: form.ticketType === "INVENTARIO" ? "PREVENTIVE_INVENTORY" : "ISSUE",
      });
    }
  }, [form.ticketType]);

  useEffect(() => {
    if (form.ticketType === "OTRO") {
      setForm({ ...form, workType: "ISSUE" });
      setOtroInput(form.ticketTypeCustom || "");
      setShowOtroModal(true);
    } else {
      setForm({
        ...form,
        ticketTypeCustom: "",
        workType: form.ticketType === "INVENTARIO" ? "PREVENTIVE_INVENTORY" : "ISSUE",
      });
    }
  }, [form.ticketType]);

  useEffect(() => {
    if (form.ticketType === "OTRO") {
      setForm({ ...form, workType: "ISSUE" });
      setOtroInput(form.ticketTypeCustom || "");
      setShowOtroModal(true);
    } else {
      setForm({
        ...form,
        ticketTypeCustom: "",
        workType: form.ticketType === "INVENTARIO" ? "PREVENTIVE_INVENTORY" : "ISSUE",
      });
    }
  }, [form.ticketType]);

  useEffect(() => {
    if (form.ticketType === "OTRO") {
      setForm({ ...form, workType: "ISSUE" });
      setOtroInput(form.ticketTypeCustom || "");
      setShowOtroModal(true);
    } else {
      setForm({
        ...form,
        ticketTypeCustom: "",
        workType: form.ticketType === "INVENTARIO" ? "PREVENTIVE_INVENTORY" : "ISSUE",
      });
    }
  }, [form.ticketType]);

  useEffect(() => {
    if (form.ticketType === "OTRO") {
      setForm({ ...form, workType: "ISSUE" });
      setOtroInput(form.ticketTypeCustom || "");
      setShowOtroModal(true);
    } else {
      setForm({
        ...form,
        ticketTypeCustom: "",
        workType: form.ticketType === "INVENTARIO" ? "PREVENTIVE_INVENTORY" : "ISSUE",
      });
    }
  }, [form.ticketType]);

  useEffect(() => {
    if (form.ticketType === "OTRO") {
      setForm({ ...form, workType: "ISSUE" });
      setOtroInput(form.ticketTypeCustom || "");
      setShowOtroModal(true);
    } else {
      setForm({
        ...form,
        ticketTypeCustom: "",
        workType: form.ticketType === "INVENTARIO" ? "PREVENTIVE_INVENTORY" : "ISSUE",
      });
    }
  }, [form.ticketType]);

  useEffect(() => {
    if (form.ticketType === "OTRO") {
      setForm({ ...form, workType: "ISSUE" });
      setOtroInput(form.ticketTypeCustom || "");
      setShowOtroModal(true);
    } else {
      setForm({
        ...form,
        ticketTypeCustom: "",
        workType: form.ticketType === "INVENTARIO" ? "PREVENTIVE_INVENTORY" : "ISSUE",
      });
    }
  }, [form.ticketType]);

  useEffect(() => {
    if (form.ticketType === "OTRO") {
      set