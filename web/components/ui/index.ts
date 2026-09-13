/**
 * O catálogo do design system.
 *
 * Importe SEMPRE daqui (`@/components/ui`) e nunca do arquivo do componente: é o
 * que deixa renomear e dividir arquivo sem tocar em tela nenhuma. O catálogo
 * visual de todos os estados vive em `/dev/ui` (fora de produção).
 */

export {
  AcaoConfirmada,
  type AcaoConfirmadaProps,
  type ResultadoDaAcao,
} from "./AcaoConfirmada";
export { ArenaCard, type ArenaCardProps } from "./ArenaCard";
export { ArteQuadra, type ArteQuadraProps } from "./ArteQuadra";
export { AvisoDeExemplo } from "./AvisoDeExemplo";
export {
  BottomNav,
  abaAtivaDe,
  ABAS_DO_ATLETA,
  type AbaDaBarra,
  type BottomNavProps,
} from "./BottomNav";
export { Button, type ButtonProps, type VarianteDoBotao, type TamanhoDoBotao } from "./Button";
export { Card, Secao, type CardProps } from "./Card";
export { Chip, ChipFaixa, type ChipProps } from "./Chip";
export { ClipCard, type ClipCardProps } from "./ClipCard";
export { ClipGrid, type ClipGridProps } from "./ClipGrid";
export { CodeInput, type CodeInputProps } from "./CodeInput";
export { CtaFixo, type CtaFixoProps } from "./CtaFixo";
export { EmptyState, type EmptyStateProps, type SugestaoDeHorario } from "./EmptyState";
export { Ilustracao, type IlustracaoProps, type NomeDaIlustracao } from "./Ilustracoes";
export { Input, type InputProps } from "./Input";
export { Interruptor, type InterruptorProps } from "./Interruptor";
export {
  InviteSheet,
  type InviteSheetProps,
  type ResultadoDoEnvio,
} from "./InviteSheet";
export { LoginGate, type LoginGateProps } from "./LoginGate";
export { Logo } from "./Logo";
export { MemberAvatars, iniciais, type Membro } from "./MemberAvatars";
export { PartnerHeader, type PartnerHeaderProps, type AbaDoParceiro } from "./PartnerHeader";
export { Player, type PlayerProps, type PosicaoDaMarca } from "./Player";
export {
  ShareBar,
  copiarTexto,
  linkDoWhatsApp,
  type ShareBarProps,
  type RegistroDeCompartilhamento,
} from "./ShareBar";
export { StatusDot, type StatusDotProps } from "./StatusDot";
export {
  TimeRangePicker,
  calcularAtalho,
  comoData,
  comoHora,
  duracaoEmMinutos,
  type Intervalo,
  type AtalhoDeTempo,
  type TimeRangePickerProps,
} from "./TimeRangePicker";
export { Toast, ToastProvider, useToast, type TomDoToast } from "./Toast";
export { VirtualButton, type VirtualButtonProps } from "./VirtualButton";
export {
  Voltar,
  RegistroDeNavegacao,
  decidirVoltar,
  registrarVisita,
  visitasNoSite,
  esquecerVisitas,
  type VoltarProps,
  type DestinoDoVoltar,
} from "./Voltar";
export { WeekSection, type Semana } from "./WeekSection";
export type { Clipe, EstadoDoClipe, Quadra, Status } from "./tipos";
