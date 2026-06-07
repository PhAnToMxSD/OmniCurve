import React, { useState, useMemo, useEffect } from 'react';
import { useWriteContract, useWaitForTransactionReceipt, useReadContract, useAccount } from 'wagmi';
import { parseUnits, maxUint256 } from 'viem';
import { DISTRIBUTION_AMM_ABI, CONTRACTS, ERC20_ABI } from '../config/abis';

interface LPPanelProps {
  marketId: string;
  currentMu: number;
  currentSigma: number;
}

const LPPanel: React.FC<LPPanelProps> = ({ currentMu, currentSigma }) => {
  const [targetMu, setTargetMu] = useState<string>(currentMu.toString());
  const [targetSigma, setTargetSigma] = useState<string>(currentSigma.toString());
  const [amount, setAmount] = useState<string>('');

  const { address } = useAccount();

  // The AMM's addLiquidity pulls USDC via transferFrom.
  // It converts amount_wad (18 dec) to USDC (6 dec) internally: amount_usdc = amount_wad / 1e12
  // So if user enters "1" meaning 1 USDC, we send amount_wad = 1e18,
  // and the contract will pull 1e18 / 1e12 = 1e6 = 1 USDC.
  const parsedAmountUsdc = useMemo(() => {
    try {
      return amount ? parseUnits(amount, 6) : 0n;
    } catch {
      return 0n;
    }
  }, [amount]);

  // Check USDC Allowance for the AMM (since the AMM pulls USDC via transferFrom)
  const { data: allowanceData, refetch: refetchAllowance } = useReadContract({
    address: CONTRACTS.USDC,
    abi: ERC20_ABI,
    functionName: 'allowance',
    args: address ? [address, CONTRACTS.DISTRIBUTION_AMM] : undefined,
    query: {
      enabled: !!address,
    }
  });

  const needsApproval = allowanceData !== undefined && (allowanceData as bigint) < parsedAmountUsdc;

  // Contract Writes
  const { writeContract: writeApprove, data: hashApprove, isPending: isPendingApprove } = useWriteContract();
  const { writeContract: writeAdd, data: hashAdd, isPending: isPendingAdd } = useWriteContract();

  const { isLoading: isConfirmingApprove, isSuccess: isSuccessApprove } = useWaitForTransactionReceipt({ hash: hashApprove });
  const { isLoading: isConfirmingAdd, isSuccess: isSuccessAdd } = useWaitForTransactionReceipt({ hash: hashAdd });

  useEffect(() => {
    if (isSuccessApprove) {
      refetchAllowance();
    }
  }, [isSuccessApprove, refetchAllowance]);

  const handleApprove = () => {
    if (!amount) return;
    // Approve max so user doesn't need to re-approve
    writeApprove({
      address: CONTRACTS.USDC,
      abi: ERC20_ABI,
      functionName: 'approve',
      args: [CONTRACTS.DISTRIBUTION_AMM, maxUint256],
    } as any);
  };

  const handleAddLiquidity = () => {
    if (!amount || !targetMu || !targetSigma || needsApproval) return;

    // amount_wad: 18 decimals (contract divides by 1e12 internally to get USDC amount)
    // target_mu / target_sigma: 15 decimals
    writeAdd({
      address: CONTRACTS.DISTRIBUTION_AMM,
      abi: DISTRIBUTION_AMM_ABI,
      functionName: 'addLiquidity',
      args: [parseUnits(amount, 18), parseUnits(targetMu, 15), parseUnits(targetSigma, 15)],
    } as any);
  };

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2">
      <div className="p-4 bg-emerald-950/20 border border-emerald-900/50 rounded-lg mb-6">
        <p className="text-emerald-400/80 text-sm">
          As a Pro Liquidity Provider, your deposited capital shapes the market. Specify your belief of the true μ and σ. Your liquidity will gently pull the global distribution towards your target values.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-2">
          <label className="text-sm text-zinc-400 uppercase">Target Mu (μ)</label>
          <input 
            type="number" 
            className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-3 text-white focus:outline-none focus:border-emerald-500 transition-colors"
            value={targetMu}
            onChange={(e) => setTargetMu(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <label className="text-sm text-zinc-400 uppercase">Target Sigma (σ)</label>
          <input 
            type="number" 
            className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-3 text-white focus:outline-none focus:border-emerald-500 transition-colors"
            value={targetSigma}
            onChange={(e) => setTargetSigma(e.target.value)}
          />
        </div>
      </div>

      <div className="space-y-2">
        <label className="text-sm text-zinc-400 uppercase">Liquidity to Provide (USDC)</label>
        <input 
          type="number" 
          placeholder="0.00" 
          className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-3 text-white focus:outline-none focus:border-emerald-500 transition-colors"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
        />
      </div>

      {needsApproval ? (
        <button 
          className="w-full py-4 rounded-lg font-bold text-lg text-white bg-blue-600 hover:bg-blue-500 transition-colors shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
          onClick={handleApprove}
          disabled={isPendingApprove || isConfirmingApprove || !amount}
        >
          {isPendingApprove ? 'Confirm in Wallet...' : isConfirmingApprove ? 'Approving...' : 'Approve USDC'}
        </button>
      ) : (
        <button 
          className="w-full py-4 rounded-lg font-bold text-lg text-white bg-emerald-600 hover:bg-emerald-500 transition-colors shadow-lg shadow-emerald-900/20 disabled:opacity-50 disabled:cursor-not-allowed"
          onClick={handleAddLiquidity}
          disabled={isPendingAdd || isConfirmingAdd || !amount || !targetMu || !targetSigma}
        >
          {isPendingAdd ? 'Confirm in Wallet...' : isConfirmingAdd ? 'Transaction Pending...' : 'Provide Liquidity'}
        </button>
      )}

      {isSuccessAdd && (
        <div className="p-3 bg-emerald-900/30 border border-emerald-800 text-emerald-400 rounded-lg text-center text-sm">
          Liquidity successfully added! Goldsky webhook is syncing...
        </div>
      )}
    </div>
  );
};

export default LPPanel;
