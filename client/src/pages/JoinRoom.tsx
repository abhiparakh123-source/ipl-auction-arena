import { useEffect } from "react";
import { useLocation } from "wouter";

export default function JoinRoom({ code }: { code: string }) {
  const [, nav] = useLocation();
  useEffect(() => { nav(`/room/${code}`, { replace: true }); }, [code]);
  return null;
}
