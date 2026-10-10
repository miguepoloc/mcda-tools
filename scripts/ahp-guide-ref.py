import numpy as np, itertools, math
round = lambda x: math.floor(x + 0.5)  # Math.round de JS (Python redondea 2.5 a 2)
cs=[5,4,2,3,2.5]; n=5
def toV(r):
    return -(min(9,max(1,round(r)))-1) if r>=1 else min(9,max(1,round(1/r)))-1
def ratio(v): return 1 if v==0 else (-v+1 if v<0 else 1/(v+1))
def mat(vals):
    A=np.ones((n,n))
    for (i,j),v in vals.items(): A[i,j]=ratio(v);A[j,i]=1/ratio(v)
    return A
RI=[0,0,0,.58,.9,1.12,1.24,1.32,1.41,1.45,1.49]
def an(A):
    e,v=np.linalg.eig(A); k=np.argmax(e.real); w=np.abs(v[:,k].real); w/=w.sum()
    lam=e[k].real; ci=(lam-n)/(n-1); return w,ci/RI[n]
vals={(i,j):toV(cs[i]/cs[j]) for i,j in itertools.combinations(range(n),2)}
print(vals); w,cr=an(mat(vals)); print('base',w,cr)
bad=dict(vals); bad[(0,4)]=8  # k0 vs k4: 9 a favor de k4 (valor +8), antes ~2
print('bad',bad[(0,4)],'was',vals[(0,4)])
A=mat(bad); w,cr=an(A); print('w',w,'cr',cr)
res=[]
for (i,j) in bad:
    r=abs(np.log(A[i,j])-np.log(w[i]/w[j])); res.append((r,i,j))
res.sort(reverse=True)
for r,i,j in res[:3]:
    t=w[i]/w[j]; cand=[k if t>=1 else -k for k in range(1,10)]
    # nearest in log
    ks=np.arange(1,10); k=ks[np.argmin(abs(np.log(ks)-abs(np.log(t))))]
    v=-(k-1) if t>=1 else k-1
    b2=dict(bad); b2[(i,j)]=int(v); print((i,j),'res',r,'target',t,'sug',v,'crafter',an(mat(b2))[1])
